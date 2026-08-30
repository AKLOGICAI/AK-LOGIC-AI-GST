from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
import logging

from ..database import get_db
from ..security import require_merchant
from ..config import settings
from .. import push_repo

logger = logging.getLogger("push_router")

public_router = APIRouter(tags=["push_public"])
merchant_router = APIRouter(tags=["push_merchant"])


class PushKeys(BaseModel):
    p256dh: str
    auth: str


class PushSubscribeIn(BaseModel):
    endpoint: str
    keys: PushKeys


class PushUnsubscribeIn(BaseModel):
    endpoint: str


# --- Public Routes ---

@public_router.get("/push/vapid-public-key")
async def get_vapid_public_key():
    """Returns the VAPID public key for web push subscription."""
    if not settings.vapid_public_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="VAPID public key not configured on this server."
        )
    return {"vapidPublicKey": settings.vapid_public_key}


# --- Merchant Routes ---

@merchant_router.post("/push/subscribe")
async def subscribe_push(
    payload: PushSubscribeIn,
    merchant_id: str = Depends(require_merchant),
    db: AsyncSession = Depends(get_db)
):
    """Subscribes the authenticated merchant to web push notifications."""
    try:
        sub = await push_repo.save(
            db,
            merchant_id=merchant_id,
            endpoint=payload.endpoint,
            p256dh=payload.keys.p256dh,
            auth=payload.keys.auth
        )
        return {"status": "ok", "subscription": sub}
    except Exception as ex:
        logger.error(f"Error subscribing merchant {merchant_id}: {ex}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save push subscription."
        )


@merchant_router.post("/push/unsubscribe")
async def unsubscribe_push(
    payload: PushUnsubscribeIn,
    merchant_id: str = Depends(require_merchant),
    db: AsyncSession = Depends(get_db)
):
    """Unsubscribes the merchant from push notifications for the given endpoint."""
    try:
        removed = await push_repo.remove(db, endpoint=payload.endpoint)
        return {"status": "ok", "removed": removed}
    except Exception as ex:
        logger.error(f"Error unsubscribing merchant {merchant_id} for endpoint {payload.endpoint}: {ex}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to remove push subscription."
        )
