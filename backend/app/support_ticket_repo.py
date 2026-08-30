from __future__ import annotations

import json
from typing import Any, Optional
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

TABLE = "public.support_tickets"

TICKET_COLUMNS = [
    "id", "merchantId", "subject", "message", "reply", "status", "createdAt"
]

_COLS_SQL = ", ".join(f'"{c}"' for c in TICKET_COLUMNS)

def _row_to_dict(row: Any) -> dict[str, Any]:
    return dict(row._mapping)

async def ensure_schema(db: AsyncSession) -> None:
    """Idempotent table creation called at startup."""
    await db.execute(text(
        f"""
        CREATE TABLE IF NOT EXISTS {TABLE} (
            "id" text PRIMARY KEY,
            "merchantId" text NOT NULL,
            "subject" text NOT NULL,
            "message" text NOT NULL,
            "reply" text,
            "status" text NOT NULL DEFAULT 'open',
            "createdAt" bigint NOT NULL
        )
        """
    ))
    await db.commit()

async def get_ticket(db: AsyncSession, ticket_id: str) -> Optional[dict[str, Any]]:
    res = await db.execute(
        text(f'select {_COLS_SQL} from {TABLE} where "id" = :id'),
        {"id": ticket_id},
    )
    row = res.first()
    return _row_to_dict(row) if row else None

async def insert_ticket(db: AsyncSession, row: dict[str, Any]) -> dict[str, Any]:
    cols = [c for c in TICKET_COLUMNS if c in row]
    col_sql = ", ".join(f'"{c}"' for c in cols)
    val_sql = ", ".join(f':{c}' for c in cols)
    res = await db.execute(
        text(
            f'insert into {TABLE} ({col_sql}) values ({val_sql}) '
            f'returning {_COLS_SQL}'
        ),
        {c: row[c] for c in cols},
    )
    saved = res.first()
    await db.commit()
    return _row_to_dict(saved)

async def list_by_merchant(db: AsyncSession, merchant_id: str) -> list[dict[str, Any]]:
    res = await db.execute(
        text(f'select {_COLS_SQL} from {TABLE} where "merchantId" = :mid order by "createdAt" desc'),
        {"mid": merchant_id},
    )
    return [_row_to_dict(r) for r in res.fetchall()]

async def list_all(db: AsyncSession) -> list[dict[str, Any]]:
    res = await db.execute(
        text(f'select {_COLS_SQL} from {TABLE} order by "createdAt" desc')
    )
    return [_row_to_dict(r) for r in res.fetchall()]

async def update_ticket(db: AsyncSession, ticket_id: str, patch: dict[str, Any]) -> Optional[dict[str, Any]]:
    cols = [c for c in TICKET_COLUMNS if c in patch and c != "id"]
    if not cols:
        return await get_ticket(db, ticket_id)
    set_sql = ", ".join(f'"{c}" = :{c}' for c in cols)
    params = {c: patch[c] for c in cols}
    params["id"] = ticket_id
    res = await db.execute(
        text(
            f'update {TABLE} set {set_sql} where "id" = :id '
            f'returning {_COLS_SQL}'
        ),
        params,
    )
    row = res.first()
    await db.commit()
    return _row_to_dict(row) if row else None
