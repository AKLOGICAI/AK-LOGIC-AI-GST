"""Merchant Purchases & Purchase OCR Router.
Extracts Purchase Bill PDF/Photos using Google Cloud Vision + auto-replenishes stock in merchant_inventory.
"""
import base64
import logging
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from .. import purchase_ocr_parser, purchase_repo
from ..database import get_db
from ..security import require_merchant

logger = logging.getLogger("purchases_router")

MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024  # 15MB limit

router = APIRouter(tags=["purchases"])


class PurchaseOcrIn(BaseModel):
    dataUrl: str = Field(..., description="Base64 encoded PDF or Photo data URL")
    filename: Optional[str] = "purchase_invoice.pdf"


class PurchaseConfirmIn(BaseModel):
    supplierName: str = Field(..., min_length=1)
    supplierGstin: Optional[str] = ""
    billNumber: str = Field(..., min_length=1)
    billDate: Optional[str] = ""
    totalAmount: float = Field(0.0, ge=0)
    totalTax: float = Field(0.0, ge=0)
    cgst: float = Field(0.0, ge=0)
    sgst: float = Field(0.0, ge=0)
    igst: float = Field(0.0, ge=0)
    items: List[Dict[str, Any]] = Field(default_factory=list)
    fileUrl: Optional[str] = ""
    allowDuplicate: Optional[bool] = False


@router.post("/purchases/upload-ocr")
async def upload_purchase_ocr(
    payload: PurchaseOcrIn,
    merchant_id: str = Depends(require_merchant),
    db: AsyncSession = Depends(get_db)
):
    """Processes uploaded Purchase Invoice PDF/Photo using Google Cloud Vision OCR."""
    if not payload.dataUrl:
        raise HTTPException(400, "No file content provided.")

    try:
        header, encoded = payload.dataUrl.split(",", 1) if "," in payload.dataUrl else ("", payload.dataUrl)
        file_bytes = base64.b64decode(encoded)
    except Exception:
        raise HTTPException(400, "Invalid base64 document or photo data.")

    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(400, "File size exceeds maximum 15MB limit. Please upload a smaller file.")

    try:
        extracted = await purchase_ocr_parser.process_file_bytes(file_bytes, payload.filename or "")
    except ValueError as e:
        raise HTTPException(422, str(e))
    except Exception as e:
        logger.exception(f"[PURCHASE OCR] Processing failed: {e}")
        raise HTTPException(422, "Could not extract text from document. Please ensure the upload is a clear purchase invoice image or PDF.")

    extracted["dataUrl"] = payload.dataUrl

    # Check duplicate purchase invoice
    dupe = await purchase_repo.check_duplicate_purchase(
        db,
        merchant_id=merchant_id,
        bill_number=extracted.get("billNumber", ""),
        supplier_gstin=extracted.get("supplierGstin", ""),
        supplier_name=extracted.get("supplierName", ""),
    )
    extracted["isDuplicate"] = bool(dupe)
    extracted["duplicateInfo"] = dupe

    return {"ok": True, "parsed": extracted}


@router.post("/purchases/confirm")
async def confirm_purchase(
    payload: PurchaseConfirmIn,
    merchant_id: str = Depends(require_merchant),
    db: AsyncSession = Depends(get_db)
):
    """Saves purchase bill record and automatically replenishes stock quantities in merchant_inventory."""
    if not payload.allowDuplicate:
        dupe = await purchase_repo.check_duplicate_purchase(
            db,
            merchant_id=merchant_id,
            bill_number=payload.billNumber,
            supplier_gstin=payload.supplierGstin or "",
            supplier_name=payload.supplierName,
        )
        if dupe:
            raise HTTPException(
                409,
                f"Duplicate Invoice Detected! Purchase Bill #{payload.billNumber} from '{payload.supplierName}' was already recorded."
            )

    saved = await purchase_repo.save_purchase_and_replenish_stock(db, merchant_id, payload.dict())
    return {"ok": True, "purchase": saved}


@router.get("/purchases")
async def list_purchases(
    limit: int = Query(50, ge=1, le=100),
    merchant_id: str = Depends(require_merchant),
    db: AsyncSession = Depends(get_db)
):
    """Retrieves merchant's purchase invoice history."""
    purchases = await purchase_repo.get_merchant_purchases(db, merchant_id, limit=limit)
    return {"purchases": purchases}
