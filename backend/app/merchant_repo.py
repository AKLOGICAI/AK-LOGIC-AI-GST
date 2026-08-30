"""Direct-Postgres repository for `public.merchants`.

WHY THIS EXISTS (Phase 2 of the RLS hardening — see
supabase/migrations/0002_merchants_rls_hardening.sql and
0005_merchants_lockdown.sql):

Every merchant read/write used to go straight from the browser to
PostgREST using the public anon key, against a table whose RLS policies
were `using (true)` / `with check (true)` — i.e. open to the world. That
let anyone holding the anon key (which ships inside the JS bundle by
design) read or overwrite every merchant's MPIN digest, bank account
number, IFSC, PAN, GSTIN, UPI ID, credits and plan status.

This module is the replacement write/read path: the backend connects to
the SAME Supabase Postgres database directly via `DATABASE_URL`, using a
role that bypasses RLS (Supabase's `postgres` role, or any role granted
`BYPASSRLS` — see backend/README.md for the exact connection string to
use). All merchant mutations now happen here, gated by the JWT checks in
security.py (`require_merchant` / `require_admin`), instead of relying on
Postgres RLS to police the anon key.

Column names are camelCase + quoted, matching the schema created by
supabase/migrations/0001_merchants_canonical_schema.sql and the Merchant
TS type (src/lib/types.ts) exactly — this module must be kept in sync
with both if either changes.

FIELD-LEVEL ENCRYPTION (bank details): bankName, accountNumber, ifsc and
upiId are encrypted at rest via field_crypto.py — every function in this
file that returns a row runs it through field_crypto.decrypt_sensitive()
before handing it back, and insert()/update() run their payload through
field_crypto.encrypt_sensitive() before it reaches SQL. This keeps
encryption entirely contained to this module: every other caller
elsewhere in the backend continues reading/writing plain values exactly
as before. See field_crypto.py's module docstring for why this exists.
"""
from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from . import field_crypto

# Every column on public.merchants, in the order the table was defined.
# Kept as an explicit allowlist so a caller can never smuggle in an
# arbitrary/unknown column via a patch dict (see update()).
MERCHANT_COLUMNS = [
    "id", "shopName", "ownerName", "legalName", "tradeName", "businessType",
    "email", "phone", "mpin", "gstin", "pan", "address", "state", "city",
    "pincode", "bankName", "accountType", "accountNumber", "ifsc",
    "signatureDataUrl", "logoDataUrl", "companySealDataUrl", "brandName", "brandColor",
    "logoUrl", "signatureUrl", "companySealUrl", "hasCustomLogo", "hasSignature", "hasCompanySeal",
    "invoicePrefix", "planId", "planName", "planValidityDays",
    "planStartedAt", "planExpiresAt", "pdfCredits", "customBranding",
    "qrId", "status", "kyc", "upiId", "lastLoginAt", "lastIp",
    "lastDevice", "createdAt", "plan", "balance",
    "lastFreeInvoiceAt", "merchantCode", "invoiceSeq",
    "networkTermsAccepted", "networkTermsAcceptedAt", "networkTermsVersion",
]

MERCHANT_SELF_EDITABLE_FIELDS = {
    "shopName", "ownerName", "legalName", "tradeName", "businessType",
    "email", "gstin", "pan", "address", "state", "city", "pincode",
    "bankName", "accountType", "accountNumber", "ifsc", "signatureDataUrl",
    "logoDataUrl", "companySealDataUrl", "brandName", "brandColor", "invoicePrefix", "upiId",
    "logoUrl", "signatureUrl", "companySealUrl", "hasCustomLogo", "hasSignature", "hasCompanySeal",
    "networkTermsAccepted", "networkTermsAcceptedAt", "networkTermsVersion",
}

ADMIN_EDITABLE_FIELDS = {
    "shopName", "ownerName", "legalName", "tradeName", "businessType",
    "email", "gstin", "pan", "address", "state", "city", "pincode",
    "bankName", "accountType", "accountNumber", "ifsc", "logoDataUrl",
    "companySealDataUrl", "brandName", "brandColor", "invoicePrefix",
    "logoUrl", "signatureUrl", "companySealUrl", "hasCustomLogo", "hasSignature", "hasCompanySeal",
    "planId", "planName", "planValidityDays", "planStartedAt",
    "planExpiresAt", "pdfCredits", "customBranding", "status", "kyc",
    "upiId", "plan", "balance",
}

HEAVY_IMAGE_COLUMNS = {"logoDataUrl", "signatureDataUrl", "companySealDataUrl"}
MERCHANT_LIGHT_COLUMNS = [c for c in MERCHANT_COLUMNS if c not in HEAVY_IMAGE_COLUMNS]

_COLS_SQL = ", ".join(f'"{c}"' for c in MERCHANT_COLUMNS)
_LIGHT_COLS_SQL = ", ".join(f'"{c}"' for c in MERCHANT_LIGHT_COLUMNS)


def _row_to_dict(row: Any) -> dict[str, Any]:
    return field_crypto.decrypt_sensitive(dict(row._mapping))


async def get_by_id(db: AsyncSession, merchant_id: str) -> Optional[dict[str, Any]]:
    """Full columns including heavy base64 images (logoDataUrl, signatureDataUrl, companySealDataUrl)."""
    res = await db.execute(
        text(f'select {_COLS_SQL} from public.merchants where id = :id'),
        {"id": merchant_id},
    )
    row = res.first()
    return _row_to_dict(row) if row else None


async def get_by_id_light(db: AsyncSession, merchant_id: str) -> Optional[dict[str, Any]]:
    """Light columns excluding heavy base64 image data URLs (saves ~350KB per request)."""
    res = await db.execute(
        text(f'select {_LIGHT_COLS_SQL} from public.merchants where id = :id'),
        {"id": merchant_id},
    )
    row = res.first()
    return _row_to_dict(row) if row else None


async def get_by_phone(db: AsyncSession, phone: str) -> Optional[dict[str, Any]]:
    res = await db.execute(
        text(f'select {_COLS_SQL} from public.merchants where phone = :phone'),
        {"phone": phone},
    )
    row = res.first()
    return _row_to_dict(row) if row else None


async def get_by_phone_light(db: AsyncSession, phone: str) -> Optional[dict[str, Any]]:
    res = await db.execute(
        text(f'select {_LIGHT_COLS_SQL} from public.merchants where phone = :phone'),
        {"phone": phone},
    )
    row = res.first()
    return _row_to_dict(row) if row else None


async def get_all_by_phone_light(db: AsyncSession, phone: str) -> list[dict[str, Any]]:
    res = await db.execute(
        text(f'select {_LIGHT_COLS_SQL} from public.merchants where phone = :phone order by "createdAt" desc'),
        {"phone": phone},
    )
    rows = res.fetchall()
    return [_row_to_dict(r) for r in rows]


async def get_by_gstin(db: AsyncSession, gstin: str) -> Optional[dict[str, Any]]:
    clean_gstin = gstin.strip().upper() if gstin else ""
    if not clean_gstin:
        return None
    res = await db.execute(
        text(f'select {_COLS_SQL} from public.merchants where upper(gstin) = upper(:gstin)'),
        {"gstin": clean_gstin},
    )
    row = res.first()
    return _row_to_dict(row) if row else None


QR_PUBLIC_COLUMNS = [
    "id", "shopName", "tradeName", "gstin", "state", "city", "status",
    "qrId", "logoUrl", "planExpiresAt", "planValidityDays", "invoicePrefix",
    "brandColor", "brandName"
]
_QR_PUBLIC_COLS_SQL = ", ".join(f'"{c}"' for c in QR_PUBLIC_COLUMNS)


async def get_public_qr_merchant(db: AsyncSession, qr_id: str) -> Optional[dict[str, Any]]:
    """Fast, lightweight public projection for QR scan lookups.
    Zero AES crypto decryption overhead, zero Base64 image payload bloat.
    Directly leverages B-Tree index on qrId."""
    clean_id = qr_id.strip()
    res = await db.execute(
        text(f'select {_QR_PUBLIC_COLS_SQL} from public.merchants where "qrId" = :qr_id or upper("qrId") = upper(:qr_id) limit 1'),
        {"qr_id": clean_id},
    )
    row = res.first()
    if not row:
        return None
    return dict(row._mapping)


async def get_by_qr_id(db: AsyncSession, qr_id: str) -> Optional[dict[str, Any]]:
    res = await db.execute(
        text(f'select {_COLS_SQL} from public.merchants where "qrId" = :qr_id or upper("qrId") = upper(:qr_id) limit 1'),
        {"qr_id": qr_id.strip()},
    )
    row = res.first()
    return _row_to_dict(row) if row else None


async def get_by_qr_id_light(db: AsyncSession, qr_id: str) -> Optional[dict[str, Any]]:
    res = await db.execute(
        text(f'select {_LIGHT_COLS_SQL} from public.merchants where "qrId" = :qr_id or upper("qrId") = upper(:qr_id) limit 1'),
        {"qr_id": qr_id.strip()},
    )
    row = res.first()
    return _row_to_dict(row) if row else None


async def list_all(db: AsyncSession) -> list[dict[str, Any]]:
    res = await db.execute(
        text(f'select {_COLS_SQL} from public.merchants order by "createdAt" desc')
    )
    return [_row_to_dict(r) for r in res.fetchall()]


async def list_all_light(db: AsyncSession) -> list[dict[str, Any]]:
    res = await db.execute(
        text(f'select {_LIGHT_COLS_SQL} from public.merchants order by "createdAt" desc')
    )
    return [_row_to_dict(r) for r in res.fetchall()]


async def insert(db: AsyncSession, merchant: dict[str, Any]) -> dict[str, Any]:
    merchant = field_crypto.encrypt_sensitive(merchant)
    cols = [c for c in MERCHANT_COLUMNS if c in merchant]
    col_sql = ", ".join(f'"{c}"' for c in cols)
    val_sql = ", ".join(f':{c}' for c in cols)
    res = await db.execute(
        text(
            f'insert into public.merchants ({col_sql}) values ({val_sql}) '
            f'returning {_COLS_SQL}'
        ),
        {c: merchant[c] for c in cols},
    )
    row = res.first()
    await db.commit()
    return _row_to_dict(row)


async def update(db: AsyncSession, merchant_id: str, patch: dict[str, Any]) -> Optional[dict[str, Any]]:
    patch = field_crypto.encrypt_sensitive(patch)
    cols = [c for c in MERCHANT_COLUMNS if c in patch and c != "id"]
    if not cols:
        return await get_by_id_light(db, merchant_id)
    set_sql = ", ".join(f'"{c}" = :{c}' for c in cols)
    params = {c: patch[c] for c in cols}
    params["id"] = merchant_id
    res = await db.execute(
        text(
            f'update public.merchants set {set_sql} where id = :id '
            f'returning {_LIGHT_COLS_SQL}'
        ),
        params,
    )
    row = res.first()
    await db.commit()
    return _row_to_dict(row) if row else None


async def next_merchant_code(db: AsyncSession) -> str:
    """Draws the next permanent Merchant ID from the DB sequence created by
    supabase/migrations/0006_merchant_code_and_invoice_number.sql, formatted
    as AKM-000001, AKM-000002, ... . nextval() is atomic across concurrent
    registrations and, by Postgres design, never hands out the same value
    twice — even across rollbacks — so this can never collide or repeat."""
    res = await db.execute(text("select nextval('public.merchant_code_seq')"))
    n = res.scalar_one()
    return f"AKM-{n:06d}"


async def next_invoice_number(db: AsyncSession, merchant_id: str) -> Optional[dict[str, Any]]:
    """Atomically increments this merchant's OWN invoice counter and returns
    the resulting invoice number (<merchantCode>-000001, -000002, ...).

    A single UPDATE ... RETURNING (same pattern as consume_credit() below)
    means two invoices approved for the same merchant at the same instant
    can never receive the same running number — the database serializes
    the two UPDATEs, not the application. Returns None if the merchant
    doesn't exist.
    """
    res = await db.execute(
        text(
            'update public.merchants '
            'set "invoiceSeq" = "invoiceSeq" + 1 '
            'where id = :id '
            'returning "merchantCode", "invoiceSeq"'
        ),
        {"id": merchant_id},
    )
    row = res.first()
    await db.commit()
    if not row:
        return None
    data = _row_to_dict(row)
    # Defensive fallback: a merchant registered before this migration ran
    # is always backfilled to a real code (see 0006's backfill step) — this
    # only guards a still-null value from ever producing a malformed
    # invoice number instead of a clear placeholder.
    code = data["merchantCode"] or "AKM-000000"
    seq = data["invoiceSeq"]
    return {"merchantCode": code, "seq": seq, "invoiceNumber": f"{code}-{seq:06d}"}


async def consume_credit(db: AsyncSession, merchant_id: str, count: int, commit: bool = True) -> Optional[dict[str, Any]]:
    """Atomically decrement pdfCredits, but never below zero and never if
    it would go negative (returns None if the merchant doesn't have enough
    credit right now) — a single UPDATE ... WHERE ... RETURNING so a burst
    of concurrent requests can't over-spend the same credit balance."""
    res = await db.execute(
        text(
            'update public.merchants '
            'set "pdfCredits" = "pdfCredits" - :count, '
            '    balance = "pdfCredits" - :count '
            'where id = :id and "pdfCredits" >= :count '
            f'returning {_LIGHT_COLS_SQL}'
        ),
        {"id": merchant_id, "count": count},
    )
    row = res.first()
    if commit:
        await db.commit()
    return _row_to_dict(row) if row else None


async def refund_credit(db: AsyncSession, merchant_id: str, count: int) -> Optional[dict[str, Any]]:
    """Atomically credit back `count` PDF credits. Compensating action for
    consume_credit() above: used ONLY when a credit was already deducted
    for an invoice that then failed to be created (e.g. the network drops
    between the /consume-credit call and the /invoices call in
    invoiceService.approve on the frontend), so the merchant is never left
    permanently short a credit they never actually used. Same single
    UPDATE ... RETURNING pattern, so it is race-safe against any
    concurrent balance change."""
    res = await db.execute(
        text(
            'update public.merchants '
            'set "pdfCredits" = "pdfCredits" + :count, '
            '    balance = "pdfCredits" + :count '
            'where id = :id '
            f'returning {_LIGHT_COLS_SQL}'
        ),
        {"id": merchant_id, "count": count},
    )
    row = res.first()
    await db.commit()
    return _row_to_dict(row) if row else None


async def try_use_free_invoice(db: AsyncSession, merchant_id: str, now: int, threshold: int, commit: bool = True) -> Optional[dict[str, Any]]:
    """Atomically claim the merchant's free daily invoice — a single
    UPDATE ... WHERE ... RETURNING that only succeeds when the last free
    usage was NULL or more than 24 hours ago. Returns the updated merchant
    row on success (free invoice claimed), or None if the cooldown has not
    elapsed (caller should fall through to the paid-credit path)."""
    res = await db.execute(
        text(
            'update public.merchants '
            'set "lastFreeInvoiceAt" = :now '
            'where id = :id '
            'and ("lastFreeInvoiceAt" is null or "lastFreeInvoiceAt" <= :threshold) '
            f'returning {_LIGHT_COLS_SQL}'
        ),
        {"id": merchant_id, "now": now, "threshold": threshold},
    )
    row = res.first()
    if commit:
        await db.commit()
    return _row_to_dict(row) if row else None
