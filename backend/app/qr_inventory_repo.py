"""Direct-Postgres repository for `public.qr_inventory`.

See supabase/migrations/0008_qr_inventory.sql for the full rationale: this
is the real, backend-only replacement for the old admin-only-localStorage
QR pool (src/lib/db.ts's `Table('qr_inventory')`), which never left the
admin's own browser and therefore could never resolve a real customer scan.

Assigning/unassigning a code here also writes/clears merchants."qrId" —
the exact column backend/app/merchant_repo.py.get_by_qr_id already reads
for the customer-facing /pay/:qrId flow — so no change is needed to that
flow at all; a printed sticker starts working the moment it's assigned.
"""
from __future__ import annotations

import secrets
from typing import Any, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

_COLS = [
    "id", "code", "seq", "status", "assignedMerchantId", "assignedAt", "createdAt",
]
_COLS_SQL = ", ".join(f'"{c}"' for c in _COLS)


def _row_to_dict(row: Any) -> dict[str, Any]:
    return dict(row._mapping)


async def list_all(db: AsyncSession) -> list[dict[str, Any]]:
    res = await db.execute(
        text(f'select {_COLS_SQL} from public.qr_inventory order by seq asc')
    )
    return [_row_to_dict(r) for r in res.fetchall()]


async def get_by_code(db: AsyncSession, code: str) -> Optional[dict[str, Any]]:
    res = await db.execute(
        text(f'select {_COLS_SQL} from public.qr_inventory where upper(code) = upper(:code)'),
        {"code": code},
    )
    row = res.first()
    return _row_to_dict(row) if row else None


async def generate_batch(db: AsyncSession, count: int, now_ms: int) -> list[dict[str, Any]]:
    """Draws `count` new sequential codes (AKM-000001 style) from
    qr_inventory_seq — same atomic-and-never-reused guarantee as
    merchant_repo.next_merchant_code (migration 0006) — and inserts them
    all as 'available'. A batch insert (not one INSERT per row) keeps a
    500-code "Generate" click to a single round trip.
    """
    if count < 1:
        return []
    rows: list[dict[str, Any]] = []
    values_sql: list[str] = []
    params: dict[str, Any] = {}
    for i in range(count):
        res = await db.execute(text("select nextval('public.qr_inventory_seq')"))
        seq = res.scalar_one()
        code = f"AKM-{seq:06d}"
        row_id = secrets.token_hex(12)
        rows.append({
            "id": row_id, "code": code, "seq": seq, "status": "available",
            "assignedMerchantId": None, "assignedAt": None, "createdAt": now_ms,
        })
        values_sql.append(
            f'(:id{i}, :code{i}, :seq{i}, \'available\', null, null, :createdAt{i})'
        )
        params.update({
            f"id{i}": row_id, f"code{i}": code, f"seq{i}": seq, f"createdAt{i}": now_ms,
        })

    await db.execute(
        text(
            f'insert into public.qr_inventory (id, code, seq, status, "assignedMerchantId", "assignedAt", "createdAt") '
            f'values {", ".join(values_sql)}'
        ),
        params,
    )
    await db.commit()
    return rows


async def assign(db: AsyncSession, code: str, merchant_id: str, now_ms: int) -> Optional[dict[str, Any]]:
    """Assigns an available code to a merchant: marks the qr_inventory row
    'assigned' and writes the sticker code straight into merchants."qrId",
    which is what the customer /pay/:qrId lookup reads. Only succeeds if
    the code is currently 'available' — a row already assigned to someone
    else must be explicitly unassigned first, so one sticker can never end
    up silently pointing at two merchants.

    If this merchant already holds a DIFFERENT pool code (e.g. an admin
    re-assigns them a fresh sticker without unassigning the old one first),
    that old pool row is freed back to 'available' automatically — so a
    merchant can only ever hold one pool code at a time and no row is left
    stuck 'assigned' to a merchant who no longer has that sticker.
    """
    old = await get_by_code(db, code)
    if old is None or old["status"] != "available":
        return None

    res = await db.execute(
        text(
            'update public.qr_inventory '
            'set status = \'assigned\', "assignedMerchantId" = :merchant_id, "assignedAt" = :now '
            'where upper(code) = upper(:code) and status = \'available\' '
            f'returning {_COLS_SQL}'
        ),
        {"code": code, "merchant_id": merchant_id, "now": now_ms},
    )
    row = res.first()
    if not row:
        await db.rollback()
        return None

    # Free any other pool code this merchant previously held.
    await db.execute(
        text(
            'update public.qr_inventory '
            'set status = \'available\', "assignedMerchantId" = null, "assignedAt" = null '
            'where "assignedMerchantId" = :merchant_id and upper(code) <> upper(:code)'
        ),
        {"merchant_id": merchant_id, "code": code},
    )
    await db.execute(
        text('update public.merchants set "qrId" = :code where id = :id'),
        {"code": code, "id": merchant_id},
    )
    await db.commit()
    return _row_to_dict(row)


async def unassign(db: AsyncSession, code: str) -> Optional[dict[str, Any]]:
    """Frees a code back to the available pool and clears it off whichever
    merchant currently holds it (merchants."qrId" only ever matches this
    code for at most one merchant, since assign() above requires the code
    to have been 'available' first). The old merchant simply has no QR
    until a new one is assigned to them; the sticker code itself can then
    be handed to a different merchant.
    """
    existing = await get_by_code(db, code)
    if not existing:
        return None
    res = await db.execute(
        text(
            'update public.qr_inventory '
            'set status = \'available\', "assignedMerchantId" = null, "assignedAt" = null '
            'where upper(code) = upper(:code) '
            f'returning {_COLS_SQL}'
        ),
        {"code": code},
    )
    row = res.first()
    if existing.get("assignedMerchantId"):
        await db.execute(
            text('update public.merchants set "qrId" = null where id = :id and upper("qrId") = upper(:code)'),
            {"id": existing["assignedMerchantId"], "code": code},
        )
    await db.commit()
    return _row_to_dict(row) if row else None
