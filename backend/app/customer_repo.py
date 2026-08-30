"""
customer_repo.py — Data access layer for public.customers table & lookup audit logs.

Follows exact pattern of merchant_repo.py with AsyncSession + text() SQL queries.
"""

from typing import Any, Optional
import time
import secrets

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


def _row_to_dict(row: Any) -> dict[str, Any]:
    return dict(row._mapping)


def mask_phone(phone: str) -> str:
    """Turn +919876543210 or 9876543210 into 98765•••10 for initial privacy search."""
    cleaned = phone.replace("+91", "").strip()
    if len(cleaned) == 10:
        return f"{cleaned[:5]}•••{cleaned[7:]}"
    return f"{phone[:3]}•••{phone[-2:]}" if len(phone) > 5 else "••••••••••"


async def ensure_schema(db: AsyncSession) -> None:
    statements = [
        "create sequence if not exists public.customer_code_seq start 1;",
        """
        create table if not exists public.customers (
          id text primary key,
          "customerCode" text unique not null,
          "name" text not null,
          "phone" text unique not null,
          "pin" text not null,
          "email" text,
          "gstin" text,
          "billingAddress" text,
          "companyName" text,
          "state" text,
          "status" text not null default 'active',
          "createdAt" bigint not null,
          "lastLoginAt" bigint
        );
        """,
        'create index if not exists idx_customers_phone on public.customers("phone");',
        'create index if not exists idx_customers_code on public.customers("customerCode");',
        """
        create table if not exists public.customer_lookup_audit_logs (
          id text primary key,
          "merchantId" text not null,
          "merchantKycStatus" text not null,
          "customerId" text,
          "lookupQuery" text not null,
          "actionType" text not null,
          "invoiceCreated" boolean default false,
          "ipAddress" text,
          "deviceInfo" text,
          "success" boolean not null,
          "createdAt" bigint not null
        );
        """,
        'create index if not exists idx_lookup_audit_merchant on public.customer_lookup_audit_logs("merchantId");',
        'create index if not exists idx_lookup_audit_customer on public.customer_lookup_audit_logs("customerId");',
        'alter table public.customers add column if not exists "primaryMerchantId" text;',
        'create index if not exists idx_customers_primary_merchant on public.customers("primaryMerchantId");',
        """
        create table if not exists public.customer_primary_merchant_logs (
          id text primary key,
          "customerId" text not null,
          "previousMerchantId" text,
          "newMerchantId" text,
          "action" text not null,
          "changedAt" bigint not null,
          "ipAddress" text
        );
        """,
        'create index if not exists idx_pm_logs_customer on public.customer_primary_merchant_logs("customerId");',
        # SECURITY FIX (2026-08-22): this table was created without RLS,
        # leaving it fully exposed to the anon/authenticated Supabase roles
        # (same class of gap as merchant_purchases/purchase_items before
        # their earlier fix). Locked down the same way every other
        # merchant/customer-scoped table in this app already is: the
        # backend's own DB role uses BYPASSRLS, so these grants were never
        # needed for the app to function.
        "ALTER TABLE public.customer_primary_merchant_logs ENABLE ROW LEVEL SECURITY;",
        "ALTER TABLE public.customer_primary_merchant_logs FORCE ROW LEVEL SECURITY;",
        "REVOKE ALL ON public.customer_primary_merchant_logs FROM anon;",
        "REVOKE ALL ON public.customer_primary_merchant_logs FROM authenticated;",
    ]
    for stmt in statements:
        try:
            await db.execute(text(stmt))
            await db.commit()
        except Exception:
            pass


async def next_customer_code(db: AsyncSession) -> str:
    """Generate next sequential 8-digit customer code (AKC-00000001, AKC-00000002, ...)."""
    res = await db.execute(text("select nextval('public.customer_code_seq')"))
    seq_val = res.scalar_one()
    return f"AKC-{seq_val:08d}"


async def get_by_email(db: AsyncSession, email: str) -> Optional[dict[str, Any]]:
    res = await db.execute(
        text('select * from public.customers where lower("email") = :email limit 1'),
        {"email": email.lower().strip()},
    )
    row = res.first()
    return _row_to_dict(row) if row else None


async def get_by_phone(db: AsyncSession, phone: str) -> Optional[dict[str, Any]]:
    clean = phone.replace("+91", "").replace(" ", "").replace("-", "").strip()
    norm = f"+91{clean}" if len(clean) == 10 else phone.strip()
    res = await db.execute(
        text('select * from public.customers where "phone" = :phone or "phone" = :clean or "phone" = :norm limit 1'),
        {"phone": phone.strip(), "clean": clean, "norm": norm},
    )
    row = res.first()
    return _row_to_dict(row) if row else None


async def get_by_customer_code(db: AsyncSession, code: str) -> Optional[dict[str, Any]]:
    res = await db.execute(
        text('select * from public.customers where "customerCode" = :code limit 1'),
        {"code": code.upper()},
    )
    row = res.first()
    return _row_to_dict(row) if row else None


async def get_by_id(db: AsyncSession, customer_id: str) -> Optional[dict[str, Any]]:
    res = await db.execute(
        text('select * from public.customers where id = :id limit 1'),
        {"id": customer_id},
    )
    row = res.first()
    return _row_to_dict(row) if row else None


def normalize_akc_query(raw_q: str) -> dict[str, Any]:
    """
    Normalizes any user query into candidate search strings.
    Handles:
    - 'AKC-00000001', 'AKC00000001', 'akc-00000001', 'akc00000001'
    - 'AKC-1', 'AKC1', '1', '00000001'
    - Uppercase/lowercase, hyphens, extra spaces, leading zeros
    - Phone numbers (+919876543210, 9876543210, 98765 43210)
    """
    clean = raw_q.strip().upper().replace(" ", "")
    clean_phone = raw_q.strip().replace(" ", "").replace("+91", "").replace("-", "")

    codes_to_check = set()
    codes_to_check.add(clean)

    # Strip prefix 'AKC-' or 'AKC'
    no_prefix = clean
    if no_prefix.startswith("AKC-"):
        no_prefix = no_prefix[4:]
    elif no_prefix.startswith("AKC"):
        no_prefix = no_prefix[3:]

    digits_only = no_prefix.replace("-", "")

    if digits_only.isdigit() and len(digits_only) > 0:
        num = int(digits_only)
        codes_to_check.add(f"AKC-{num:08d}")  # Standard AKC-00000001
        codes_to_check.add(f"AKC-{num}")       # AKC-1
        codes_to_check.add(f"AKC{num:08d}")    # AKC00000001
        codes_to_check.add(f"AKC{num}")        # AKC1
        codes_to_check.add(str(num))           # 1
        codes_to_check.add(f"{num:08d}")       # 00000001

    if clean.startswith("AKC") and not clean.startswith("AKC-"):
        codes_to_check.add("AKC-" + clean[3:])

    return {
        "codes": list(codes_to_check),
        "clean_phone": clean_phone,
        "raw_clean": clean,
    }


async def search_customer_resilient(db: AsyncSession, query_str: str) -> Optional[dict[str, Any]]:
    """Universal resilient search for customer by AKC ID (any format) or Phone."""
    norm = normalize_akc_query(query_str)
    
    res = await db.execute(
        text("""
            select * from public.customers 
            where upper("customerCode") = any(:codes)
               or upper(replace("customerCode", '-', '')) = any(:codes)
               or "phone" = :clean_phone
               or replace("phone", '+91', '') = :clean_phone
            limit 1
        """),
        {
            "codes": norm["codes"],
            "clean_phone": norm["clean_phone"],
        },
    )
    row = res.first()
    return _row_to_dict(row) if row else None


async def get_masked_profile(db: AsyncSession, query_str: str) -> Optional[dict[str, Any]]:
    """Return masked customer profile for initial search step (Step 1 privacy masking)."""
    c = await search_customer_resilient(db, query_str)

    if not c or c.get("status") in ("suspended", "disabled"):
        return None

    return {
        "customerCode": c["customerCode"],
        "name": c["name"],
        "phoneMasked": mask_phone(c["phone"]),
        "state": c.get("state") or "",
    }


async def get_unmasked_billing_profile(db: AsyncSession, code_or_phone: str) -> Optional[dict[str, Any]]:
    """Return complete unmasked billing profile for invoice creation (Step 2 selection)."""
    c = await search_customer_resilient(db, code_or_phone)

    if not c or c.get("status") in ("suspended", "disabled"):
        return None

    return {
        "customerCode": c["customerCode"],
        "name": c["name"],
        "phone": c["phone"],
        "email": c.get("email") or "",
        "gstin": c.get("gstin") or "",
        "billingAddress": c.get("billingAddress") or "",
        "companyName": c.get("companyName") or "",
        "state": c.get("state") or "",
    }


async def log_lookup_audit(db: AsyncSession, audit_data: dict[str, Any]) -> None:
    """Store immutable audit log entry for every lookup & select attempt."""
    row = {
        "id": secrets.token_urlsafe(16),
        "merchantId": audit_data.get("merchantId", ""),
        "merchantKycStatus": audit_data.get("merchantKycStatus", "unknown"),
        "customerId": audit_data.get("customerId"),
        "lookupQuery": audit_data.get("lookupQuery", ""),
        "actionType": audit_data.get("actionType", "lookup"),
        "invoiceCreated": audit_data.get("invoiceCreated", False),
        "ipAddress": audit_data.get("ipAddress", ""),
        "deviceInfo": audit_data.get("deviceInfo", ""),
        "success": audit_data.get("success", True),
        "createdAt": int(time.time() * 1000),
    }

    cols = list(row.keys())
    col_sql = ", ".join(f'"{c}"' for c in cols)
    val_sql = ", ".join(f":{c}" for c in cols)

    await db.execute(
        text(f'insert into public.customer_lookup_audit_logs ({col_sql}) values ({val_sql})'),
        row,
    )
    await db.commit()


async def insert(db: AsyncSession, row: dict[str, Any]) -> dict[str, Any]:
    cols = list(row.keys())
    col_sql = ", ".join(f'"{c}"' for c in cols)
    val_sql = ", ".join(f":{c}" for c in cols)

    res = await db.execute(
        text(f'insert into public.customers ({col_sql}) values ({val_sql}) returning *'),
        row,
    )
    saved = res.first()
    await db.commit()
    return _row_to_dict(saved)


async def update(db: AsyncSession, customer_id: str, patch: dict[str, Any]) -> Optional[dict[str, Any]]:
    if not patch:
        return await get_by_id(db, customer_id)

    cols = list(patch.keys())
    set_sql = ", ".join(f'"{c}" = :{c}' for c in cols)
    params = dict(patch)
    params["id"] = customer_id

    res = await db.execute(
        text(f'update public.customers set {set_sql} where id = :id returning *'),
        params,
    )
    row = res.first()
    await db.commit()
    return _row_to_dict(row) if row else None


# ==========================================
# Primary Merchant Controls (Module 2)
# ==========================================

async def get_primary_merchant(db: AsyncSession, customer_id: str) -> Optional[dict[str, Any]]:
    """Returns primary merchant full profile for a customer."""
    await ensure_schema(db)
    res = await db.execute(
        text("""
            SELECT m.id, m."merchantCode", m."shopName", m.phone, m.address, m.city, m.pincode, m.state, m."logoUrl"
            FROM public.customers c
            JOIN public.merchants m ON m.id = c."primaryMerchantId"
            WHERE c.id = :cid
            LIMIT 1
        """),
        {"cid": customer_id},
    )
    row = res.first()
    return _row_to_dict(row) if row else None


async def set_primary_merchant(
    db: AsyncSession,
    customer_id: str,
    merchant_id: str,
    ip_address: str = "",
) -> bool:
    """Designates a merchant as the customer's primary merchant with audit trail."""
    await ensure_schema(db)
    now = int(time.time() * 1000)

    # 1. Fetch current primary merchant
    c = await get_by_id(db, customer_id)
    if not c:
        return False
    prev_mid = c.get("primaryMerchantId")

    # 2. Update customer record
    await db.execute(
        text('UPDATE public.customers SET "primaryMerchantId" = :mid WHERE id = :cid'),
        {"mid": merchant_id, "cid": customer_id},
    )

    # 3. Log audit event
    log_id = f"pmlog_{secrets.token_hex(8)}"
    action = "set" if not prev_mid else "change"
    await db.execute(
        text("""
            INSERT INTO public.customer_primary_merchant_logs
            (id, "customerId", "previousMerchantId", "newMerchantId", "action", "changedAt", "ipAddress")
            VALUES (:id, :cid, :pmid, :nmid, :action, :now, :ip)
        """),
        {
            "id": log_id,
            "cid": customer_id,
            "pmid": prev_mid,
            "nmid": merchant_id,
            "action": action,
            "now": now,
            "ip": ip_address,
        },
    )
    await db.commit()
    return True


async def remove_primary_merchant(
    db: AsyncSession,
    customer_id: str,
    ip_address: str = "",
) -> bool:
    """Removes the designated primary merchant (customer has full control) with audit log."""
    await ensure_schema(db)
    now = int(time.time() * 1000)

    c = await get_by_id(db, customer_id)
    if not c:
        return False
    prev_mid = c.get("primaryMerchantId")
    if not prev_mid:
        return True

    # 1. Clear column
    await db.execute(
        text('UPDATE public.customers SET "primaryMerchantId" = NULL WHERE id = :cid'),
        {"cid": customer_id},
    )

    # 2. Log audit event
    log_id = f"pmlog_{secrets.token_hex(8)}"
    await db.execute(
        text("""
            INSERT INTO public.customer_primary_merchant_logs
            (id, "customerId", "previousMerchantId", "newMerchantId", "action", "changedAt", "ipAddress")
            VALUES (:id, :cid, :pmid, NULL, 'remove', :now, :ip)
        """),
        {
            "id": log_id,
            "cid": customer_id,
            "pmid": prev_mid,
            "now": now,
            "ip": ip_address,
        },
    )
    await db.commit()
    return True


async def search_customers(db: AsyncSession, query: str, limit: int = 5) -> list[dict[str, Any]]:
    q = query.strip()
    res = await db.execute(
        text('''
            SELECT id, "customerCode", name, phone, email, gstin, "billingAddress", state
            FROM public.customers
            WHERE "customerCode" ILIKE :pattern
               OR name ILIKE :pattern
               OR phone ILIKE :pattern
               OR COALESCE(gstin, '') ILIKE :pattern
            LIMIT :lim
        '''),
        {"pattern": f"%{q}%", "lim": limit}
    )
    return [_row_to_dict(r) for r in res.fetchall()]

