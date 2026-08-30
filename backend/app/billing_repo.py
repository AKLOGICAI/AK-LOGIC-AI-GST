"""Direct-Postgres repository for `public.billing_requests` and
`public.invoices`.

WHY THIS EXISTS (RLS hardening Phase 3 — see
supabase/migrations/0007_billing_invoices_lockdown.sql): these two tables
used to be reachable directly from the browser via PostgREST with the
public anon key, under `using (true)` / `with check (true)` policies —
open to the world, with zero merchant isolation. This module is the
replacement read/write path, exactly mirroring merchant_repo.py: the
backend connects to the SAME Supabase Postgres database directly via
DATABASE_URL, using a role that bypasses RLS. Every merchant-facing route
in routers/billing.py scopes its query by the JWT-authenticated
merchant_id; every public (customer-facing) route here is a narrow,
single-row lookup by an already-known id, never a bulk scan.

Column names are camelCase + quoted, matching
supabase/migrations/0004_billing_requests_and_invoices.sql and the
InvoiceRequest / Invoice TS types (src/lib/types.ts) exactly.
"""
from __future__ import annotations

import json
from typing import Any, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from . import merchant_repo

REQUEST_COLUMNS = [
    "id", "merchantId", "invoiceNo", "invoiceNumber", "invoiceId",
    "customerName", "customerPhone", "customerEmail", "customerGstin",
    "customerPan", "customerAddress", "customerState", "paymentMode",
    "paymentRef", "items", "notes", "rejectReason", "status",
    "createdAt", "resolvedAt", "branded",
]

INVOICE_COLUMNS = [
    "id", "requestId", "merchantId", "invoiceNo", "invoiceNumber",
    "invoiceDate", "customerName", "customerPhone", "customerEmail",
    "customerGstin", "customerPan", "customerAddress", "customerState",
    "paymentMode", "paymentRef", "notes", "items", "taxableValue",
    "cgst", "sgst", "igst", "totalTax", "roundOff", "grandTotal",
    "amountInWords", "placeOfSupply", "isInterState", "branded",
    "createdAt",
]

# Fields a merchant may PATCH on their OWN pending request via
# PATCH /api/merchant/billing-requests/{id}. Deliberately excludes
# merchantId, id, createdAt, status/invoiceId/invoiceNo/invoiceNumber/
# resolvedAt (those are only ever set by the reject/approve endpoints
# themselves, never a free-form patch) — see routers/billing.py.
REQUEST_SELF_EDITABLE_FIELDS = {
    "customerName", "customerPhone", "customerEmail", "customerGstin",
    "customerPan", "customerAddress", "customerState", "paymentMode",
    "paymentRef", "items", "notes",
}

_REQ_COLS_SQL = ", ".join(f'"{c}"' for c in REQUEST_COLUMNS)
_INV_COLS_SQL = ", ".join(f'"{c}"' for c in INVOICE_COLUMNS)


def _row_to_dict(row: Any) -> dict[str, Any]:
    return dict(row._mapping)


# ---------------- billing_requests ----------------

async def get_request(db: AsyncSession, request_id: str) -> Optional[dict[str, Any]]:
    res = await db.execute(
        text(f'select {_REQ_COLS_SQL} from public.billing_requests where id = :id'),
        {"id": request_id},
    )
    row = res.first()
    return _row_to_dict(row) if row else None


async def list_by_merchant(db: AsyncSession, merchant_id: str) -> list[dict[str, Any]]:
    res = await db.execute(
        text(
            f'select {_REQ_COLS_SQL} from public.billing_requests '
            'where "merchantId" = :mid order by "createdAt" desc'
        ),
        {"mid": merchant_id},
    )
    return [_row_to_dict(r) for r in res.fetchall()]


async def list_all_requests(db: AsyncSession) -> list[dict[str, Any]]:
    res = await db.execute(
        text(f'select {_REQ_COLS_SQL} from public.billing_requests order by "createdAt" desc')
    )
    return [_row_to_dict(r) for r in res.fetchall()]


async def insert_request(db: AsyncSession, row: dict[str, Any]) -> dict[str, Any]:
    row_copy = dict(row)
    if "items" in row_copy and not isinstance(row_copy["items"], str):
        row_copy["items"] = json.dumps(row_copy["items"])
    cols = [c for c in REQUEST_COLUMNS if c in row_copy]
    col_sql = ", ".join(f'"{c}"' for c in cols)
    val_sql = ", ".join(f':{c}' for c in cols)
    res = await db.execute(
        text(
            f'insert into public.billing_requests ({col_sql}) values ({val_sql}) '
            f'returning {_REQ_COLS_SQL}'
        ),
        {c: row_copy[c] for c in cols},
    )
    saved = res.first()
    await db.commit()
    return _row_to_dict(saved)


async def update_request(db: AsyncSession, request_id: str, patch: dict[str, Any]) -> Optional[dict[str, Any]]:
    patch_copy = dict(patch)
    if "items" in patch_copy and not isinstance(patch_copy["items"], str):
        patch_copy["items"] = json.dumps(patch_copy["items"])
    cols = [c for c in REQUEST_COLUMNS if c in patch_copy and c != "id"]
    if not cols:
        return await get_request(db, request_id)
    set_sql = ", ".join(f'"{c}" = :{c}' for c in cols)
    params = {c: patch_copy[c] for c in cols}
    params["id"] = request_id
    res = await db.execute(
        text(
            f'update public.billing_requests set {set_sql} where id = :id '
            f'returning {_REQ_COLS_SQL}'
        ),
        params,
    )
    row = res.first()
    await db.commit()
    return _row_to_dict(row) if row else None


# ---------------- invoices ----------------

async def get_invoice(db: AsyncSession, invoice_id: str) -> Optional[dict[str, Any]]:
    res = await db.execute(
        text(f'select {_INV_COLS_SQL} from public.invoices where id = :id'),
        {"id": invoice_id},
    )
    row = res.first()
    return _row_to_dict(row) if row else None


async def get_invoice_by_request(db: AsyncSession, request_id: str) -> Optional[dict[str, Any]]:
    res = await db.execute(
        text(f'select {_INV_COLS_SQL} from public.invoices where "requestId" = :rid'),
        {"rid": request_id},
    )
    row = res.first()
    return _row_to_dict(row) if row else None


async def list_invoices_by_merchant(db: AsyncSession, merchant_id: str) -> list[dict[str, Any]]:
    res = await db.execute(
        text(
            f'select {_INV_COLS_SQL} from public.invoices '
            'where "merchantId" = :mid order by "createdAt" desc'
        ),
        {"mid": merchant_id},
    )
    return [_row_to_dict(r) for r in res.fetchall()]


async def list_all_invoices(db: AsyncSession) -> list[dict[str, Any]]:
    res = await db.execute(
        text(f'select {_INV_COLS_SQL} from public.invoices order by "createdAt" desc')
    )
    return [_row_to_dict(r) for r in res.fetchall()]


async def insert_invoice(db: AsyncSession, row: dict[str, Any], commit: bool = True) -> dict[str, Any]:
    row_copy = dict(row)
    if not row_copy.get("requestId"):
        row_copy["requestId"] = f"req_{row_copy.get('id', secrets.token_hex(6))}"
    if "items" in row_copy and not isinstance(row_copy["items"], str):
        row_copy["items"] = json.dumps(row_copy["items"])
    cols = [c for c in INVOICE_COLUMNS if c in row_copy]
    col_sql = ", ".join(f'"{c}"' for c in cols)
    val_sql = ", ".join(f':{c}' for c in cols)
    res = await db.execute(
        text(
            f'insert into public.invoices ({col_sql}) values ({val_sql}) '
            f'on conflict (id) do nothing returning {_INV_COLS_SQL}'
        ),
        {c: row_copy[c] for c in cols},
    )
    saved = res.first()
    if commit:
        await db.commit()
    if saved:
        return _row_to_dict(saved)
    existing = await get_invoice(db, row_copy["id"])
    return existing or row_copy


async def approve_request_with_invoice(
    db: AsyncSession,
    request_id: str,
    merchant_id: str,
    invoice_row: dict[str, Any],
    request_patch: dict[str, Any],
) -> Optional[tuple[dict[str, Any], dict[str, Any]]]:
    """Atomically: verify the request is still pending and owned by this
    merchant, insert the invoice, and flip the request to approved — all
    in one transaction (one AsyncSession, committed once at the end), so
    a crash/error partway through can never leave an invoice saved with
    its originating request still stuck on 'pending' with no invoiceId,
    or vice versa. Returns None if the request doesn't exist, isn't
    'pending', or doesn't belong to merchant_id (the caller should treat
    that as 404/409, not silently retry).
    """
    try:
        res = await db.execute(
            text(
                'select "merchantId", status from public.billing_requests where id = :id for update'
            ),
            {"id": request_id},
        )
        row = res.first()
        if not row or row.merchantId != merchant_id or row.status != "pending":
            await db.rollback()
            return None

        # --- FREE INVOICE or CREDIT DEDUCTION STEP ---
        # Try the free daily invoice first (1 per 24h, independent of paid plan).
        # If the cooldown hasn't elapsed, fall through to the paid-credit path.
        from . import plans_ms
        now = plans_ms.now_ms()
        threshold = now - plans_ms.FREE_INVOICE_COOLDOWN_MS
        free_used = await merchant_repo.try_use_free_invoice(db, merchant_id, now, threshold, commit=False)
        if not free_used:
            # Free invoice not available — require a paid credit as before.
            credited = await merchant_repo.consume_credit(db, merchant_id, 1, commit=False)
            if not credited:
                await db.rollback()
                return None

        invoice_copy = dict(invoice_row)
        if "items" in invoice_copy and not isinstance(invoice_copy["items"], str):
            invoice_copy["items"] = json.dumps(invoice_copy["items"])

        patch_copy = dict(request_patch)
        if "items" in patch_copy and not isinstance(patch_copy["items"], str):
            patch_copy["items"] = json.dumps(patch_copy["items"])

        inv_cols = [c for c in INVOICE_COLUMNS if c in invoice_copy]
        inv_col_sql = ", ".join(f'"{c}"' for c in inv_cols)
        inv_val_sql = ", ".join(f':{c}' for c in inv_cols)
        inv_res = await db.execute(
            text(
                f'insert into public.invoices ({inv_col_sql}) values ({inv_val_sql}) '
                f'returning {_INV_COLS_SQL}'
            ),
            {c: invoice_copy[c] for c in inv_cols},
        )
        saved_invoice = _row_to_dict(inv_res.first())

        req_cols = [c for c in REQUEST_COLUMNS if c in patch_copy]
        req_set_sql = ", ".join(f'"{c}" = :{c}' for c in req_cols)
        req_params = {c: patch_copy[c] for c in req_cols}
        req_params["id"] = request_id
        req_res = await db.execute(
            text(
                f'update public.billing_requests set {req_set_sql} where id = :id '
                f'returning {_REQ_COLS_SQL}'
            ),
            req_params,
        )
        saved_request = _row_to_dict(req_res.first())

        # Post Double-Entry Sales Journal Entry if Deep Accounting enabled for this merchant
        try:
            from . import feature_flags_repo, accounting_repo
            if await feature_flags_repo.is_enabled(db, "deep_accounting_enabled", merchant_id=merchant_id):
                await accounting_repo.post_invoice_journal(
                    db=db,
                    merchant_id=merchant_id,
                    invoice_data=saved_invoice,
                    commit=False
                )
        except Exception:
            pass

        # Atomic In-DB Stock Deduction on Invoice Approval
        try:
            raw_items = saved_invoice.get("items") or invoice_copy.get("items")
            if isinstance(raw_items, str):
                parsed_items = json.loads(raw_items)
            elif isinstance(raw_items, list):
                parsed_items = raw_items
            else:
                parsed_items = []

            for it in parsed_items:
                it_desc = (it.get("description") or it.get("name") or "").strip()
                it_hsn = (it.get("hsn") or "").strip()
                it_qty = float(it.get("qty") or 1)

                if it_desc or it_hsn:
                    hsn_clause = "OR (hsn_code = :hsn AND length(hsn_code) >= 6)" if len(it_hsn) >= 6 else ""
                    await db.execute(
                        text(f'''
                            UPDATE public.merchant_inventory
                            SET stock_quantity = GREATEST(0, stock_quantity - :qty),
                                updated_at = :now
                            WHERE merchant_id = :mid
                              AND (lower(product_name) = lower(:name) {hsn_clause})
                        '''),
                        {"mid": merchant_id, "name": it_desc, "hsn": it_hsn, "qty": it_qty, "now": now}
                    )
        except Exception as e:
            pass

        # Auto-post invoice summary into customer chat thread if active thread exists
        try:
            import secrets
            cust_phone = saved_invoice.get("customerPhone") or ""
            if cust_phone:
                clean_phone = cust_phone.replace("+91", "").strip()
                res_th = await db.execute(
                    text('''
                        SELECT id FROM public.chat_threads
                        WHERE merchant_id = :mid
                          AND (customer_phone = :phone OR customer_phone = :full_phone)
                        LIMIT 1
                    '''),
                    {"mid": merchant_id, "phone": clean_phone, "full_phone": cust_phone}
                )
                th_row = res_th.first()
                if th_row:
                    th_id = th_row[0]
                    inv_no = saved_invoice.get("invoiceNo") or "INV"
                    inv_total = float(saved_invoice.get("grandTotal") or 0.0)
                    msg_content = f"🧾 Tax Invoice #{inv_no} generated for ₹{inv_total:,.2f}. Official GST invoice ready."
                    msg_id = f"msg_{secrets.token_hex(8)}"
                    await db.execute(
                        text('''
                            INSERT INTO public.chat_messages
                            (id, thread_id, sender_type, sender_id, msg_type, content, status, created_at)
                            VALUES (:id, :tid, 'merchant', :mid, 'invoice', :content, 'sent', :now)
                        '''),
                        {"id": msg_id, "tid": th_id, "mid": merchant_id, "content": msg_content, "now": now}
                    )
                    await db.execute(
                        text('''
                            UPDATE public.chat_threads
                            SET last_message_snippet = :snippet, last_message_at = :now, customer_unread_count = customer_unread_count + 1
                            WHERE id = :tid
                        '''),
                        {"snippet": f"🧾 Invoice #{inv_no}", "now": now, "tid": th_id}
                    )
        except Exception:
            pass

        await db.commit()
        return saved_invoice, saved_request
    except Exception:
        await db.rollback()
        raise


# ==========================================
# Merchant Product Intelligence (Phase 2)
# ==========================================

async def get_product_intelligence(
    db: AsyncSession,
    merchant_id: str,
) -> list[dict[str, Any]]:
    """Compute Merchant Product Intelligence dynamically from canonical invoice history.
    
    Unpacks the JSONB 'items' array from all invoices belonging to the merchant,
    aggregating by product description to determine sales volume, frequency,
    recency, and average pricing. This strictly uses public.invoices as the
    only source of truth.
    """
    res = await db.execute(
        text('''
            SELECT
                item->>'description' AS name,
                MAX(item->>'hsn') AS hsn,
                MAX((item->>'gstRate')::numeric) AS gst_rate,
                AVG((item->>'rate')::numeric) AS average_rate,
                SUM((item->>'qty')::numeric) AS total_qty_sold,
                COUNT(*) AS frequency,
                MAX("createdAt") AS last_sold_at
            FROM
                public.invoices,
                jsonb_array_elements(items) AS item
            WHERE
                "merchantId" = :merchant_id
                AND item->>'description' IS NOT NULL
                AND item->>'description' != ''
            GROUP BY
                item->>'description'
            ORDER BY
                frequency DESC, last_sold_at DESC
        '''),
        {"merchant_id": merchant_id}
    )
    
    results = []
    for row in res.fetchall():
        row_dict = dict(row._mapping)
        results.append({
            "name": row_dict["name"],
            "hsn": row_dict.get("hsn"),
            "gst_rate": float(row_dict["gst_rate"]) if row_dict.get("gst_rate") is not None else None,
            "average_rate": float(row_dict["average_rate"]) if row_dict.get("average_rate") is not None else 0.0,
            "total_qty_sold": float(row_dict["total_qty_sold"]) if row_dict.get("total_qty_sold") is not None else 0.0,
            "frequency": int(row_dict["frequency"]),
            "last_sold_at": int(row_dict["last_sold_at"]),
        })
        
    return results


# ==========================================
# Merchant Behaviour Intelligence (Phase 3)
# ==========================================

async def get_merchant_behaviour(
    db: AsyncSession,
    merchant_id: str,
) -> dict[str, Any]:
    """Compute raw Merchant Behaviour Intelligence metrics from canonical tables.
    
    Extracts responsiveness, trading frequency, and activity volume purely
    from public.invoices and public.billing_requests.
    """
    # 1. Invoice Metrics (Volume & Recency)
    inv_res = await db.execute(
        text('''
            SELECT 
                COUNT(*) AS total_invoices,
                SUM("grandTotal") AS total_volume,
                MAX("createdAt") AS last_invoice_at
            FROM public.invoices
            WHERE "merchantId" = :merchant_id
        '''),
        {"merchant_id": merchant_id}
    )
    inv_row = inv_res.first()
    
    # 2. Billing Request Metrics (Responsiveness & Reliability)
    req_res = await db.execute(
        text('''
            SELECT
                COUNT(*) FILTER (WHERE status = 'approved') AS approved_count,
                COUNT(*) FILTER (WHERE status = 'rejected') AS rejected_count,
                COUNT(*) FILTER (WHERE status = 'pending') AS ignored_count,
                AVG("resolvedAt" - "createdAt") FILTER (WHERE "resolvedAt" IS NOT NULL) AS avg_response_time
            FROM public.billing_requests
            WHERE "merchantId" = :merchant_id
        '''),
        {"merchant_id": merchant_id}
    )
    req_row = req_res.first()
    
    # 3. Merchant Activity (Login Recency)
    merch_res = await db.execute(
        text('SELECT "lastLoginAt" FROM public.merchants WHERE id = :merchant_id'),
        {"merchant_id": merchant_id}
    )
    merch_row = merch_res.first()

    return {
        "total_invoices_generated": int(inv_row.total_invoices) if inv_row and inv_row.total_invoices else 0,
        "total_trade_volume": float(inv_row.total_volume) if inv_row and inv_row.total_volume else 0.0,
        "approved_requests_count": int(req_row.approved_count) if req_row and req_row.approved_count else 0,
        "rejected_requests_count": int(req_row.rejected_count) if req_row and req_row.rejected_count else 0,
        "ignored_requests_count": int(req_row.ignored_count) if req_row and req_row.ignored_count else 0,
        "avg_response_time_ms": float(req_row.avg_response_time) if req_row and req_row.avg_response_time is not None else None,
        "last_invoice_at": int(inv_row.last_invoice_at) if inv_row and inv_row.last_invoice_at else None,
        "last_login_at": int(merch_row.lastLoginAt) if merch_row and merch_row.lastLoginAt else None,
    }


# ==========================================
# Phase 7: Merchant Relationship Intelligence
# ==========================================

async def get_merchant_relationships(db: AsyncSession, merchant_id: str) -> dict[str, Any]:
    """Phase 7: Automatically extract business relationships from invoice history.
    Identifies repeat suppliers and frequent customers on the platform without manual connections.
    """
    res = await db.execute(text('SELECT gstin FROM public.merchants WHERE id = :id'), {"id": merchant_id})
    row = res.first()
    caller_gstin = row[0] if row else None
    
    suppliers = []
    if caller_gstin:
        suppliers_query = """
            SELECT 
                m.id as merchant_id,
                m."shopName" as shop_name,
                COUNT(i.id) as total_invoices,
                SUM(i."grandTotal") as total_volume,
                MAX(i."createdAt") as last_trade_at
            FROM public.invoices i
            JOIN public.merchants m ON i."merchantId" = m.id
            WHERE UPPER(TRIM(i."customerGstin")) = UPPER(TRIM(:caller_gstin))
            GROUP BY m.id, m."shopName"
            ORDER BY total_volume DESC
        """
        suppliers_res = await db.execute(text(suppliers_query), {"caller_gstin": caller_gstin})
        suppliers = [_row_to_dict(r) for r in suppliers_res.fetchall()]

    customers_query = """
        SELECT 
            m.id as merchant_id,
            m."shopName" as shop_name,
            COUNT(i.id) as total_invoices,
            SUM(i."grandTotal") as total_volume,
            MAX(i."createdAt") as last_trade_at
        FROM public.invoices i
        JOIN public.merchants m ON UPPER(TRIM(i."customerGstin")) = UPPER(TRIM(m.gstin))
        WHERE i."merchantId" = :caller_id 
          AND i."customerGstin" IS NOT NULL 
          AND TRIM(i."customerGstin") != ''
        GROUP BY m.id, m."shopName"
        ORDER BY total_volume DESC
    """
    customers_res = await db.execute(text(customers_query), {"caller_id": merchant_id})
    customers = [_row_to_dict(r) for r in customers_res.fetchall()]
    
    return {
        "suppliers": suppliers,
        "customers": customers
    }


async def list_invoices_by_customer_phone(
    db: AsyncSession,
    phone: str,
) -> list[dict[str, Any]]:
    """List all invoices across all merchants for a customer matched by phone number."""
    import re
    digits = re.sub(r"\D", "", phone)
    if len(digits) > 10:
        digits = digits[-10:]

    query = f'''
        select i.{_INV_COLS_SQL.replace('", "', '", i."')}, m."shopName" as "merchantShopName"
        from public.invoices i
        left join public.merchants m on i."merchantId" = m.id
        where right(regexp_replace(i."customerPhone", '\\D', 'g'), 10) = :phone_digits
        order by i."createdAt" desc
    '''
    res = await db.execute(text(query), {"phone_digits": digits})
    rows = res.fetchall()
    return [_row_to_dict(r) for r in rows]
