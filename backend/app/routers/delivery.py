"""
routers/delivery.py — Parcel Dispatch & Order Logistics Endpoints.

1-Click dispatch from invoices. Gated by parcel_delivery_enabled flag.
"""

from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from .. import security, delivery_repo, feature_flags_repo

router = APIRouter(tags=["delivery"])


class CreateDeliveryIn(BaseModel):
    invoiceId: str = Field(..., description="ID of the canonical invoice")
    courierName: Optional[str] = Field("Self Dispatch", description="Name of courier or driver")
    trackingRef: Optional[str] = Field("", description="Tracking code or AWB number")


class UpdateDeliveryStatusIn(BaseModel):
    deliveryId: str = Field(..., description="ID of delivery record")
    status: str = Field(..., description="'picked' | 'in_transit' | 'delivered' | 'failed'")
    notes: Optional[str] = Field("", description="Optional status note")


@router.post("/merchant/deliveries/create-from-invoice")
async def create_delivery(
    body: CreateDeliveryIn,
    merchant_id: str = Depends(security.require_merchant),
    db: AsyncSession = Depends(get_db),
):
    """1-Click creation of a dispatch shipment directly from an approved invoice."""
    if not await feature_flags_repo.is_enabled(db, "parcel_delivery_enabled", merchant_id=merchant_id):
        raise HTTPException(403, "Parcel delivery feature is currently disabled.")

    delivery = await delivery_repo.create_delivery_from_invoice(
        db=db,
        merchant_id=merchant_id,
        invoice_id=body.invoiceId,
        courier_name=body.courierName or "Self Dispatch",
        tracking_ref=body.trackingRef or "",
    )
    if not delivery:
        raise HTTPException(404, "Invoice not found or delivery could not be created.")

    return {"ok": True, "delivery": delivery}


@router.post("/merchant/deliveries/status")
async def update_status(
    body: UpdateDeliveryStatusIn,
    merchant_id: str = Depends(security.require_merchant),
    db: AsyncSession = Depends(get_db),
):
    """Updates the shipment delivery status."""
    delivery = await delivery_repo.update_delivery_status(
        db=db,
        merchant_id=merchant_id,
        delivery_id=body.deliveryId,
        status_val=body.status,
        notes=body.notes or "",
    )
    if not delivery:
        raise HTTPException(404, "Delivery record not found.")

    return {"ok": True, "delivery": delivery}


@router.get("/merchant/deliveries")
async def list_deliveries(
    limit: int = Query(50, ge=1, le=200),
    merchant_id: str = Depends(security.require_merchant),
    db: AsyncSession = Depends(get_db),
):
    """Lists recent shipments dispatched by this merchant."""
    deliveries = await delivery_repo.list_merchant_deliveries(db, merchant_id, limit=limit)
    return {"ok": True, "deliveries": deliveries}


@router.get("/public/deliveries/track/{delivery_id}")
async def track_delivery(
    delivery_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Public tracking page endpoint for customers."""
    info = await delivery_repo.get_delivery_tracking_info(db, delivery_id)
    if not info:
        raise HTTPException(404, "Shipment tracking record not found.")

    return {"ok": True, **info}
