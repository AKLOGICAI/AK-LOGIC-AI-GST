"""
routers/accounting.py — Merchant Double-Entry Accounting Endpoints.

Secured by merchant JWT authentication. Zero complexity for merchant — everything auto-calculated.
"""

from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from .. import security, accounting_repo, feature_flags_repo

router = APIRouter(tags=["accounting"])


class ReversalIn(BaseModel):
    entryId: str = Field(..., description="ID of journal entry to reverse")
    reason: Optional[str] = Field("Credit Note / Return", description="Reason for reversal")


@router.get("/merchant/accounting/overview")
async def get_financial_overview(
    merchant_id: str = Depends(security.require_merchant),
    db: AsyncSession = Depends(get_db),
):
    """Instant 1-Click Financial Health Overview."""
    summary = await accounting_repo.get_financial_summary(db, merchant_id)
    return {"ok": True, "summary": summary}


@router.get("/merchant/accounting/trial-balance")
async def get_trial_balance(
    merchant_id: str = Depends(security.require_merchant),
    db: AsyncSession = Depends(get_db),
):
    """Calculates balanced Trial Balance across all accounts."""
    tb = await accounting_repo.get_trial_balance(db, merchant_id)
    return {"ok": True, "trial_balance": tb}


@router.get("/merchant/accounting/ledger/{account_code}")
async def get_account_ledger(
    account_code: str,
    party_ref: Optional[str] = Query(None, description="Optional party name filter"),
    merchant_id: str = Depends(security.require_merchant),
    db: AsyncSession = Depends(get_db),
):
    """Detailed general ledger statement for a specific account."""
    ledger = await accounting_repo.get_account_ledger(db, merchant_id, account_code, party_ref=party_ref)
    return {"ok": True, "ledger": ledger}


@router.get("/merchant/accounting/supplier-payables")
async def get_supplier_payables(
    merchant_id: str = Depends(security.require_merchant),
    db: AsyncSession = Depends(get_db),
):
    """Party-wise running balance of supplier payables (Sundry Creditors)."""
    payables = await accounting_repo.get_supplier_payables_summary(db, merchant_id)
    return {"ok": True, "payables": payables}


@router.get("/merchant/accounting/customer-receivables")
async def get_customer_receivables(
    merchant_id: str = Depends(security.require_merchant),
    db: AsyncSession = Depends(get_db),
):
    """Party-wise running balance of customer receivables (Sundry Debtors)."""
    receivables = await accounting_repo.get_customer_receivables_summary(db, merchant_id)
    return {"ok": True, "receivables": receivables}


@router.get("/merchant/accounting/gst-register")
async def get_gst_register(
    merchant_id: str = Depends(security.require_merchant),
    db: AsyncSession = Depends(get_db),
):
    """Comprehensive GST Tax Register for ITC vs Output Tax calculation."""
    gst_reg = await accounting_repo.get_gst_tax_register(db, merchant_id)
    return {"ok": True, "gst_register": gst_reg}


@router.post("/merchant/accounting/reversal")
async def reverse_entry(
    body: ReversalIn,
    merchant_id: str = Depends(security.require_merchant),
    db: AsyncSession = Depends(get_db),
):
    """Creates a balanced reversing journal entry (reversal/credit note)."""
    res = await accounting_repo.reverse_journal_entry(db, merchant_id, body.entryId, reason=body.reason or "Reversal")
    if not res:
        raise HTTPException(400, "Unable to reverse entry. Entry may not exist or is already reversed.")
    return {"ok": True, "result": res}


@router.post("/merchant/accounting/sync")
@router.post("/merchant/accounting/sync-books")
async def sync_accounting_books(
    merchant_id: str = Depends(security.require_merchant),
    db: AsyncSession = Depends(get_db),
):
    """Comprehensive automatic reconciliation of all historical invoices and purchase bills."""
    res = await accounting_repo.sync_merchant_accounting(db, merchant_id)
    return {"ok": True, "sync_result": res}

