from __future__ import annotations

import logging
from typing import Any, Optional
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

TABLE = "public.push_subscriptions"


async def ensure_schema(db: AsyncSession) -> None:
    """Idempotent table creation for push subscriptions.
    Called once at startup.
    """
    await db.execute(text(
        f"""
        CREATE TABLE IF NOT EXISTS {TABLE} (
            id SERIAL PRIMARY KEY,
            "merchantId" text NOT NULL,
            endpoint text UNIQUE NOT NULL,
            p256dh text NOT NULL,
            auth text NOT NULL,
            "createdAt" timestamptz NOT NULL DEFAULT now()
        )
        """
    ))
    await db.commit()


def _row_to_dict(row: Any) -> dict[str, Any]:
    return dict(row._mapping)


async def save(db: AsyncSession, merchant_id: str, endpoint: str, p256dh: str, auth: str) -> dict[str, Any]:
    """Saves or updates a push subscription.
    Prevents duplicate subscriptions by handling conflict on endpoint.
    """
    res = await db.execute(
        text(
            f"""
            INSERT INTO {TABLE} ("merchantId", endpoint, p256dh, auth, "createdAt")
            VALUES (:merchant_id, :endpoint, :p256dh, :auth, now())
            ON CONFLICT (endpoint) DO UPDATE
                SET "merchantId" = EXCLUDED."merchantId",
                    p256dh = EXCLUDED.p256dh,
                    auth = EXCLUDED.auth,
                    "createdAt" = now()
            RETURNING id, "merchantId", endpoint, p256dh, auth, "createdAt"
            """
        ),
        {
            "merchant_id": merchant_id,
            "endpoint": endpoint,
            "p256dh": p256dh,
            "auth": auth
        }
    )
    row = res.first()
    await db.commit()
    return _row_to_dict(row)


async def remove(db: AsyncSession, endpoint: str) -> bool:
    """Removes a subscription by endpoint."""
    res = await db.execute(
        text(f"DELETE FROM {TABLE} WHERE endpoint = :endpoint RETURNING id"),
        {"endpoint": endpoint}
    )
    row = res.first()
    await db.commit()
    return row is not None


async def list_for_merchant(db: AsyncSession, merchant_id: str) -> list[dict[str, Any]]:
    """Lists subscriptions for a single merchant."""
    res = await db.execute(
        text(f'SELECT id, "merchantId", endpoint, p256dh, auth, "createdAt" FROM {TABLE} WHERE "merchantId" = :merchant_id'),
        {"merchant_id": merchant_id}
    )
    return [_row_to_dict(r) for r in res.fetchall()]


async def list_for_merchants(db: AsyncSession, merchant_ids: list[str]) -> list[dict[str, Any]]:
    """Lists subscriptions for multiple merchants."""
    if not merchant_ids:
        return []
    res = await db.execute(
        text(f'SELECT id, "merchantId", endpoint, p256dh, auth, "createdAt" FROM {TABLE} WHERE "merchantId" = ANY(:merchant_ids)'),
        {"merchant_ids": merchant_ids}
    )
    return [_row_to_dict(r) for r in res.fetchall()]


async def list_all(db: AsyncSession) -> list[dict[str, Any]]:
    """Lists all push subscriptions."""
    res = await db.execute(
        text(f'SELECT id, "merchantId", endpoint, p256dh, auth, "createdAt" FROM {TABLE}')
    )
    return [_row_to_dict(r) for r in res.fetchall()]
