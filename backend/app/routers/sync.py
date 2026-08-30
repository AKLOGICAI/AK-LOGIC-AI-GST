"""sync.py — Router for Offline-to-Cloud Batch Synchronization.

Provides high-speed, idempotent, atomic operations processing for offline transactions.
"""
import json
import logging
from typing import Any, Dict, List, Optional, Union
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from .. import security, sync_repo

logger = logging.getLogger("sync")

router = APIRouter(tags=["sync"])


class SyncOperationIn(BaseModel):
    idempotency_key: str = Field(..., description="Unique client-generated idempotency token")
    entity_type: str = Field(..., description="'invoice', 'purchase', 'inventory_delta', or 'contact'")
    entity_id: str = Field(..., description="Local ID of the entity")
    action: str = Field("CREATE", description="'CREATE', 'UPDATE', or 'DELETE'")
    payload: Union[Dict[str, Any], str] = Field(..., description="Entity payload data")


@router.post("/merchant/sync/batch")
async def process_sync_batch(
    body: SyncOperationIn,
    merchant_id: str = Depends(security.require_merchant),
    db: AsyncSession = Depends(get_db)
):
    """
    Idempotent batch processor for offline-created transactions.
    Reconciles sales invoices, inventory stock deltas, and double-entry journals atomically.
    """
    try:
        await sync_repo.ensure_schema(db)

        # 1. Idempotency Check
        cached_resp = await sync_repo.get_cached_idempotent_response(db, body.idempotency_key)
        if cached_resp:
            return cached_resp

        # Normalize payload if string
        if isinstance(body.payload, str):
            try:
                body_payload = json.loads(body.payload)
            except Exception:
                body_payload = {}
        else:
            body_payload = body.payload

        # 2. Ingest by Entity Type
        if body.entity_type == "invoice":
            inv_raw = body_payload.get("invoice") or body_payload
            if isinstance(inv_raw, str):
                try:
                    inv_payload = json.loads(inv_raw)
                except Exception:
                    inv_payload = {}
            else:
                inv_payload = inv_raw

            stock_deltas = body_payload.get("stock_deltas") or []
            journal_entry = body_payload.get("journal_entry")
            journal_lines = body_payload.get("journal_lines")

            result = await sync_repo.process_sync_invoice(
                db=db,
                merchant_id=merchant_id,
                invoice_payload=inv_payload,
                stock_deltas=stock_deltas,
                journal_entry=journal_entry,
                journal_lines=journal_lines,
                idempotency_key=body.idempotency_key
            )
            return result

        return {"ok": True, "confirmed_id": body.entity_id}
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        logger.error(f"[Sync] Error processing batch sync: {e}\n{tb}")
        raise HTTPException(status_code=400, detail=f"Sync error: {str(e)}")
