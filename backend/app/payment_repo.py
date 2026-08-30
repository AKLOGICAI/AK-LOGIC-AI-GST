"""Direct-Postgres repository for `public.payment_orders`.

See supabase/migrations/0008_payment_orders.sql for the full root-cause
writeup of the bug this closes (paid plans could be activated with no
payment at all). This module is intentionally small: an order is created
with a server-computed amount, later marked 'paid' only after a real
signature check (routers/merchant.py's /verify-payment), and 'consumed'
exactly once by /purchase-plan or /extend-validity.
"""
from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

COLUMNS = [
    "id", "merchantId", "purpose", "itemId", "amount", "status", "consumed",
    "providerOrderId", "providerPaymentId", "signature", "createdAt", "paidAt",
]
_COLS_SQL = ", ".join(f'"{c}"' for c in COLUMNS)


def _row_to_dict(row: Any) -> dict[str, Any]:
    return dict(row._mapping)


async def create_order(db: AsyncSession, order: dict[str, Any]) -> dict[str, Any]:
    cols = [c for c in COLUMNS if c in order]
    col_sql = ", ".join(f'"{c}"' for c in cols)
    val_sql = ", ".join(f':{c}' for c in cols)
    res = await db.execute(
        text(f'insert into public.payment_orders ({col_sql}) values ({val_sql}) returning {_COLS_SQL}'),
        {c: order[c] for c in cols},
    )
    row = res.first()
    await db.commit()
    return _row_to_dict(row)


async def get_order(db: AsyncSession, order_id: str) -> Optional[dict[str, Any]]:
    res = await db.execute(
        text(f'select {_COLS_SQL} from public.payment_orders where id = :id'),
        {"id": order_id},
    )
    row = res.first()
    return _row_to_dict(row) if row else None


async def mark_paid(
    db: AsyncSession, order_id: str, provider_payment_id: str, signature: str, paid_at: int,
) -> Optional[dict[str, Any]]:
    """Only transitions status 'created' -> 'paid' (the WHERE clause makes
    this a no-op, not an error, if the order is already paid/failed or
    doesn't exist — the caller checks the returned row for None)."""
    res = await db.execute(
        text(
            'update public.payment_orders set status = \'paid\', '
            '"providerPaymentId" = :pid, signature = :sig, "paidAt" = :paid_at '
            'where id = :id and status = \'created\' '
            f'returning {_COLS_SQL}'
        ),
        {"id": order_id, "pid": provider_payment_id, "sig": signature, "paid_at": paid_at},
    )
    row = res.first()
    await db.commit()
    return _row_to_dict(row) if row else None


async def consume_order(
    db: AsyncSession, order_id: str, merchant_id: str, purpose: str, item_id: str,
) -> Optional[dict[str, Any]]:
    """Atomically marks a paid order as consumed — a single UPDATE ...
    WHERE status='paid' AND consumed=false ... RETURNING, so a captured
    payment can fund exactly one plan activation, even under concurrent/
    duplicate calls. Also checks merchantId/purpose/itemId match so a
    verified order for one merchant/plan can't be replayed against a
    different one."""
    res = await db.execute(
        text(
            'update public.payment_orders set consumed = true '
            'where id = :id and "merchantId" = :mid and purpose = :purpose '
            'and "itemId" = :item_id and status = \'paid\' and consumed = false '
            f'returning {_COLS_SQL}'
        ),
        {"id": order_id, "mid": merchant_id, "purpose": purpose, "item_id": item_id},
    )
    row = res.first()
    await db.commit()
    return _row_to_dict(row) if row else None
