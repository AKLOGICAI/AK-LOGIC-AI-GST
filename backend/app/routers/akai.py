"""
akai.py — Router for @AKAI Business Operating Copilot endpoints.
"""
from __future__ import annotations
import logging
import secrets
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from .. import security, akai_tools, akai_service, merchant_repo, feature_flags_repo
from ..database import get_db

logger = logging.getLogger("akai_router")
router = APIRouter(prefix="/merchant/akai", tags=["akai_copilot"])


class AkaiPromptIn(BaseModel):
    prompt: str
    context: Optional[Dict[str, Any]] = None


class AkaiExecuteActionIn(BaseModel):
    actionType: str
    confirmationToken: str
    idempotencyKey: Optional[str] = None


@router.post("/query")
async def akai_copilot_query(
    payload: AkaiPromptIn,
    merchant_id: str = Depends(security.require_merchant),
    db: AsyncSession = Depends(get_db),
):
    """Processes natural language business query or action request for @AKAI."""
    # Check feature flag for merchant
    if not await feature_flags_repo.is_enabled(db, "akai_assistant_enabled", merchant_id=merchant_id):
        raise HTTPException(403, detail="AKAI Business Copilot is not enabled for your account.")

    try:
        res = await akai_service.handle_akai_copilot_turn(db, merchant_id, payload.prompt)
        return res
    except Exception as e:
        logger.error(f"Error in akai_copilot_query: {e}", exc_info=True)
        return {
            "ok": False,
            "reply": f"Maaf kijiyega, query process karte waqt takneeki samasya aayi: {str(e)}",
            "error": str(e),
        }



@router.post("/execute-action")
async def akai_execute_action(
    payload: AkaiExecuteActionIn,
    merchant_id: str = Depends(security.require_merchant),
    db: AsyncSession = Depends(get_db),
):
    """Executes a confirmed business action (e.g. invoice creation) idempotently."""
    if not await feature_flags_repo.is_enabled(db, "akai_assistant_enabled", merchant_id=merchant_id):
        raise HTTPException(403, detail="AKAI Business Copilot is not enabled for your account.")

    idemp_key = payload.idempotencyKey or f"idemp_{secrets.token_hex(8)}"
    try:
        res = await akai_tools.tool_execute_confirmed_action(
            db=db,
            merchant_id=merchant_id,
            action_type=payload.actionType,
            confirmation_token=payload.confirmationToken,
            idempotency_key=idemp_key,
        )

        if not res.get("ok"):
            raise HTTPException(400, detail=res.get("message", "Action execution failed."))

        return res
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in akai_execute_action: {e}", exc_info=True)
        raise HTTPException(400, detail=f"Execution error: {str(e)}")


@router.get("/quick-prompts")
async def akai_quick_prompts():
    """Returns contextual suggestion chips for the merchant chat drawer."""
    prompts = [
        {"text": "@akai Rahul ka invoice banao", "label": "🧾 Create Invoice"},
        {"text": "@akai Aaj ki sale aur GST kitna hua?", "label": "📊 Today's Sales & GST"},
        {"text": "@akai Low stock items check karo", "label": "📦 Low Stock Alerts"},
        {"text": "@akai Pending customer requests dikhao", "label": "⏳ Pending Requests"},
        {"text": "@akai Mera credit balance kitna hai?", "label": "💳 PDF Credits Balance"},
    ]
    return {"ok": True, "prompts": prompts}


@router.get("/audit-feature-flag")
async def akai_audit_feature_flag(
    merchant_id: str = Depends(security.require_merchant),
    db: AsyncSession = Depends(get_db),
):
    """Whether the 'AKAI Business Controller / Live Audit' self-audit tool
    (AkaiTriggerButton, AkaiAuditOverlay) should be shown to this merchant.
    Separate flag from akai_assistant_enabled — see feature_flags_repo.py.
    Mirrors the exact response shape of merchant-network's feature-flag
    endpoint so the frontend can reuse the same fetch/cache pattern.
    """
    enabled = await feature_flags_repo.is_enabled(db, "akai_audit_enabled", merchant_id=merchant_id)
    return {"akai_audit_enabled": enabled}


@router.get("/audit-summary")
async def akai_audit_summary(
    merchant_id: str = Depends(security.require_merchant),
    db: AsyncSession = Depends(get_db),
):
    """Deterministic server-side business audit verification for AKAI Controller.

    SECURITY FIX (2026-08-26): this endpoint had no feature-flag check at
    all, unlike /query and /execute-action above — meaning any merchant
    with a valid JWT could call it directly regardless of whether the
    AKAI Audit tool was meant to be available to them. Not a data-leak risk
    (it only reads the caller's own merchant_id data), but inconsistent
    with the rest of this router and with the new admin-controlled
    per-merchant rollout for this tool. Now gated the same way as every
    other akai_audit_enabled-gated entry point.
    """
    if not await feature_flags_repo.is_enabled(db, "akai_audit_enabled", merchant_id=merchant_id):
        raise HTTPException(403, detail="AKAI Business Controller audit is not enabled for your account.")

    from .. import accounting_repo, billing_repo, inventory_repo
    from sqlalchemy import text

    # 1. Check Accounting Trial Balance
    tb = await accounting_repo.get_trial_balance(db, merchant_id)
    is_balanced = tb.get("is_balanced", True) if tb else True

    # 2. Check for Duplicate Invoices
    res = await db.execute(
        text('SELECT "invoiceNo", COUNT(*) as cnt FROM public.invoices WHERE "merchantId" = :mid GROUP BY "invoiceNo" HAVING COUNT(*) > 1'),
        {"mid": merchant_id}
    )
    duplicates = [row[0] for row in res.fetchall()]

    # 3. Check Pending Requests Count
    res_req = await db.execute(
        text('SELECT COUNT(*) FROM public.billing_requests WHERE "merchantId" = :mid AND status = :st'),
        {"mid": merchant_id, "st": "pending"}
    )
    pending_count = res_req.scalar() or 0

    return {
        "ok": True,
        "is_balanced": is_balanced,
        "total_debit": tb.get("total_debit", 0) if tb else 0,
        "total_credit": tb.get("total_credit", 0) if tb else 0,
        "duplicate_invoices": duplicates,
        "pending_requests_count": pending_count,
        "status": "verified"
    }


@router.get("/feature-flag")
@router.get("/audit/feature-flag")
async def get_akai_audit_feature_flag(
    merchant_id: str = Depends(security.require_merchant),
    db: AsyncSession = Depends(get_db),
):
    """Checks if AKAI Business Controller / Live Audit feature is enabled for this merchant."""
    enabled = await feature_flags_repo.is_enabled(db, "akai_audit_enabled", merchant_id=merchant_id)
    return {
        "ok": True,
        "akai_audit_enabled": enabled,
        "enabled": enabled,
    }


@router.get("/version")
async def akai_version():
    """Deployment version verification endpoint."""
    return {"version": "v1.4-audit-controller", "status": "active"}


