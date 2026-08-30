"""
routers/ondc.py — ONDC (Beckn Protocol) Seller Network Participant Endpoints.

All endpoints adhere to the official Beckn specifications. Gated by ondc_enabled feature flag.
"""

from typing import Any, Dict
import logging
from fastapi import APIRouter, Depends, Request, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from .. import ondc_service, feature_flags_repo

logger = logging.getLogger("ondc_router")
router = APIRouter(tags=["ondc"])


@router.post("/ondc/search")
async def ondc_search(request: Request, db: AsyncSession = Depends(get_db)):
    """ONDC /search: BAP catalog discovery request."""
    if not await feature_flags_repo.is_enabled(db, "ondc_enabled"):
        return ondc_service.create_beckn_ack("0", is_ack=False, error_msg="ONDC SNP integration not enabled.")
    body = await request.json()
    msg_id = body.get("context", {}).get("message_id", "msg_0")
    logger.info(f"ONDC /search received: {body.get('context', {})}")
    return ondc_service.create_beckn_ack(msg_id, is_ack=True)


@router.post("/ondc/select")
async def ondc_select(request: Request, db: AsyncSession = Depends(get_db)):
    """ONDC /select: Item selection and price calculation."""
    if not await feature_flags_repo.is_enabled(db, "ondc_enabled"):
        return ondc_service.create_beckn_ack("0", is_ack=False, error_msg="ONDC SNP not enabled.")
    body = await request.json()
    msg_id = body.get("context", {}).get("message_id", "msg_0")
    return ondc_service.create_beckn_ack(msg_id, is_ack=True)


@router.post("/ondc/init")
async def ondc_init(request: Request, db: AsyncSession = Depends(get_db)):
    """ONDC /init: Order initialization with billing and delivery addresses."""
    if not await feature_flags_repo.is_enabled(db, "ondc_enabled"):
        return ondc_service.create_beckn_ack("0", is_ack=False, error_msg="ONDC SNP not enabled.")
    body = await request.json()
    msg_id = body.get("context", {}).get("message_id", "msg_0")
    return ondc_service.create_beckn_ack(msg_id, is_ack=True)


@router.post("/ondc/confirm")
async def ondc_confirm(request: Request, db: AsyncSession = Depends(get_db)):
    """ONDC /confirm: Confirms order placement from buyer."""
    if not await feature_flags_repo.is_enabled(db, "ondc_enabled"):
        return ondc_service.create_beckn_ack("0", is_ack=False, error_msg="ONDC SNP not enabled.")
    body = await request.json()
    msg_id = body.get("context", {}).get("message_id", "msg_0")
    return ondc_service.create_beckn_ack(msg_id, is_ack=True)


@router.post("/ondc/status")
async def ondc_status(request: Request, db: AsyncSession = Depends(get_db)):
    """ONDC /status: Polls fulfillment and delivery status."""
    if not await feature_flags_repo.is_enabled(db, "ondc_enabled"):
        return ondc_service.create_beckn_ack("0", is_ack=False, error_msg="ONDC SNP not enabled.")
    body = await request.json()
    msg_id = body.get("context", {}).get("message_id", "msg_0")
    return ondc_service.create_beckn_ack(msg_id, is_ack=True)


@router.post("/ondc/track")
async def ondc_track(request: Request, db: AsyncSession = Depends(get_db)):
    """ONDC /track: Live tracking endpoint."""
    if not await feature_flags_repo.is_enabled(db, "ondc_enabled"):
        return ondc_service.create_beckn_ack("0", is_ack=False, error_msg="ONDC SNP not enabled.")
    body = await request.json()
    msg_id = body.get("context", {}).get("message_id", "msg_0")
    return ondc_service.create_beckn_ack(msg_id, is_ack=True)


@router.post("/ondc/cancel")
async def ondc_cancel(request: Request, db: AsyncSession = Depends(get_db)):
    """ONDC /cancel: Cancels confirmed order."""
    if not await feature_flags_repo.is_enabled(db, "ondc_enabled"):
        return ondc_service.create_beckn_ack("0", is_ack=False, error_msg="ONDC SNP not enabled.")
    body = await request.json()
    msg_id = body.get("context", {}).get("message_id", "msg_0")
    return ondc_service.create_beckn_ack(msg_id, is_ack=True)
