from __future__ import annotations

import json
import logging
from typing import Optional
from fastapi.concurrency import run_in_threadpool
from pywebpush import webpush, WebPushException
from sqlalchemy.ext.asyncio import AsyncSession

from .config import settings
from . import push_repo

logger = logging.getLogger(__name__)


def is_configured() -> bool:
    """Checks if the VAPID keys and subject are properly configured."""
    return bool(
        settings.vapid_public_key
        and settings.vapid_private_key
        and settings.vapid_subject
    )


async def _send_raw(db: AsyncSession, subscription: dict, payload: dict) -> bool:
    """Internal helper to send a web push notification using pywebpush.
    Automatically deletes the subscription if the push service returns 404 or 410.
    """
    if not is_configured():
        logger.warning("Web Push is not configured. Set VAPID keys and subject.")
        return False

    subscription_info = {
        "endpoint": subscription["endpoint"],
        "keys": {
            "p256dh": subscription["p256dh"],
            "auth": subscription["auth"]
        }
    }

    def sync_send():
        try:
            webpush(
                subscription_info=subscription_info,
                data=json.dumps(payload),
                vapid_private_key=settings.vapid_private_key,
                vapid_claims={"sub": settings.vapid_subject}
            )
            return True, None
        except WebPushException as ex:
            status_code = getattr(ex.response, "status_code", None)
            if status_code in (404, 410):
                return False, "expired"
            return False, f"HTTP {status_code}: {ex.message or str(ex)}"
        except Exception as ex:
            return False, str(ex)

    success, reason = await run_in_threadpool(sync_send)
    if not success:
        if reason == "expired":
            logger.info(f"Subscription expired (404/410). Removing subscription {subscription['id']}.")
            await push_repo.remove(db, subscription["endpoint"])
        else:
            logger.error(f"Failed to send Web Push to subscription {subscription['id']}: {reason}")
        return False

    return True


async def send_to_merchant(
    db: AsyncSession, merchant_id: str, title: str, body: str, url: Optional[str] = None
) -> int:
    """Sends a push notification to all active push subscriptions of a specific merchant."""
    subscriptions = await push_repo.list_for_merchant(db, merchant_id)
    if not subscriptions:
        logger.debug(f"No push subscriptions found for merchant {merchant_id}.")
        return 0

    payload = {
        "title": title,
        "body": body,
        "url": url or "/dashboard"
    }

    sent_count = 0
    for sub in subscriptions:
        if await _send_raw(db, sub, payload):
            sent_count += 1
    return sent_count


async def send_to_merchants(
    db: AsyncSession, merchant_ids: list[str], title: str, body: str, url: Optional[str] = None
) -> int:
    """Sends a push notification to all active push subscriptions of multiple merchants."""
    subscriptions = await push_repo.list_for_merchants(db, merchant_ids)
    if not subscriptions:
        logger.debug(f"No push subscriptions found for target merchants.")
        return 0

    payload = {
        "title": title,
        "body": body,
        "url": url or "/dashboard"
    }

    sent_count = 0
    for sub in subscriptions:
        if await _send_raw(db, sub, payload):
            sent_count += 1
    return sent_count


async def send_broadcast(
    db: AsyncSession, title: str, body: str, url: Optional[str] = None
) -> int:
    """Sends a broadcast push notification to all registered subscriptions."""
    subscriptions = await push_repo.list_all(db)
    if not subscriptions:
        logger.debug("No push subscriptions registered in the system.")
        return 0

    payload = {
        "title": title,
        "body": body,
        "url": url or "/dashboard"
    }

    sent_count = 0
    for sub in subscriptions:
        if await _send_raw(db, sub, payload):
            sent_count += 1
    return sent_count
