"""Billing requests + invoices — RLS hardening Phase 3.

WHY THIS FILE EXISTS: see supabase/migrations/0007_billing_invoices_lockdown.sql.
Before this, every read/write on billing_requests and invoices happened
directly from the browser against Supabase with the public anon key under
`using (true)` / `with check (true)` policies — no merchant isolation at
all (any client could read or edit any merchant's customer data, or
fabricate an "approved" invoice directly). This router is the fix,
following the exact same pattern merchant.py already established for
`merchants` (backend/app/billing_repo.py, direct-Postgres/BYPASSRLS).

Three trust levels, three sets of endpoints:
  - /api/public/*   — no auth. A customer has no login in this app at
    all, so request creation and status polling are narrow, single-row,
    capability-style lookups (by the request's own unguessable id) —
    never a bulk scan of the table.
  - /api/merchant/* — require_merchant. Every query is scoped to the
    authenticated merchant's own id; ownership is re-checked on every
    write, not just assumed from the URL.
  - /api/admin/*    — require_admin. Read-only (list-all) for the admin
    console's revenue/audit views; admins don't get a generic write path
    onto customer-submitted data through this router.
"""
from __future__ import annotations

import logging
import secrets

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .. import billing_repo, customer_repo, gst_engine, merchant_repo, plans_ms, rate_limit_repo, push_service, inventory_repo, accounting_repo
from ..database import get_db
from ..schemas import (
    BillingRequestCreateIn,
    BillingRequestPatchIn,
    BillingRequestRejectIn,
    InvoiceApproveIn,
)
from ..security import require_admin, require_merchant

logger = logging.getLogger("billing")

public_router = APIRouter(tags=["billing-public"])
merchant_router = APIRouter(tags=["billing-merchant"])
admin_router = APIRouter(tags=["billing-admin"])


# ---------------- abuse throttle for public request creation ----------------
# A customer submitting a request needs no login, so this endpoint is the
# one billing_requests write anyone on the internet can reach. Mirrors the
# shape of merchant.py's login lockout / main.py's OTP throttle: a coarse,
# per-IP cap, not a substitute for a real edge rate-limiter/WAF in front
# of the API, but enough to stop a single client from flooding the table.
#
# Previously an in-memory `_create_buckets: Dict[str, _Bucket]` — broken
# across multiple workers/instances (an IP over the limit on worker A
# could keep flooding freely via worker B). Now backed by Postgres via
# rate_limit_repo.py, shared cluster-wide the same way `public.merchants`
# already is.
CREATE_MAX_PER_WINDOW = 20
CREATE_WINDOW_SECONDS = 10 * 60


async def _check_create_throttle(db: AsyncSession, client_ip: str) -> None:
    limited = await rate_limit_repo.check_and_increment_window(
        db, f"billing_bucket:create-request:{client_ip}", CREATE_MAX_PER_WINDOW, CREATE_WINDOW_SECONDS,
    )
    if limited:
        raise HTTPException(429, "Too many requests. Please try again later.")


def _public_request(r: dict) -> dict:
    return r


# ---------------- public (customer, no auth) ----------------

@public_router.post("/billing-requests")
async def create_billing_request(
    payload: BillingRequestCreateIn, request: Request, db: AsyncSession = Depends(get_db),
):
    client_ip = request.client.host if request.client else "unknown"
    await _check_create_throttle(db, client_ip)

    merchant = await merchant_repo.get_by_id(db, payload.merchantId)
    if not merchant or merchant.get("status") not in ("active", None):
        # Don't leak WHICH reason (unknown vs suspended) beyond what the
        # existing QR-scan flow already tells a customer elsewhere.
        raise HTTPException(404, "Merchant not found or not accepting requests.")

    now = plans_ms.now_ms()
    row = {
        "id": f"req_{secrets.token_hex(10)}",
        "merchantId": payload.merchantId,
        "customerName": payload.customerName,
        "customerPhone": payload.customerPhone,
        "customerEmail": payload.customerEmail,
        "customerGstin": payload.customerGstin,
        "customerPan": payload.customerPan,
        "customerAddress": payload.customerAddress or "Address Pending",
        "customerState": payload.customerState,
        "paymentMode": payload.paymentMode,
        "paymentRef": payload.paymentRef,
        "items": payload.items,
        "notes": payload.notes,
        "status": "pending",
        "createdAt": now,
        "branded": payload.branded,
    }
    saved = await billing_repo.insert_request(db, row)
    try:
        await push_service.send_to_merchant(
            db,
            payload.merchantId,
            title="New Billing Request",
            body=f"You have received a new billing request from {payload.customerName}."
        )
    except Exception as push_err:
        logger.error(f"Silent failure sending push notification on request creation: {push_err}")

    # Server-side determination of next UI state for customer (prevents public customer exists API exposure)
    next_step = "create_popup"
    if payload.customerPhone:
        import re
        cleaned = re.sub(r"\D", "", payload.customerPhone)
        norm_phone = f"+91{cleaned}" if len(cleaned) == 10 else payload.customerPhone
        existing_cust = await customer_repo.get_by_phone(db, norm_phone)
        if existing_cust:
            next_step = "welcome_back"

    return {"ok": True, "request": _public_request(saved), "nextStep": next_step}


@public_router.get("/billing-requests/{request_id}")
async def get_billing_request(request_id: str, db: AsyncSession = Depends(get_db)):
    """Capability-style lookup: the request's own id (an unguessable
    token handed to the customer once, right after they created it) is
    the only credential — same trust model as e.g. a payment receipt
    link. Returns just this one row, never a list."""
    row = await billing_repo.get_request(db, request_id)
    if not row:
        raise HTTPException(404, "Request not found.")
    return _public_request(row)


@public_router.get("/invoices/by-request/{request_id}")
async def get_invoice_by_request(request_id: str, db: AsyncSession = Depends(get_db)):
    row = await billing_repo.get_invoice_by_request(db, request_id)
    if not row:
        raise HTTPException(404, "Invoice not found.")
    return row


@public_router.get("/merchants/by-qr/{qr_id}")
async def get_merchant_by_qr(qr_id: str, db: AsyncSession = Depends(get_db)):
    """Retrieve public merchant details by QR ID without authentication.
    Ultra-fast, lightweight projection for customer QR flow (< 1.5 KB payload)."""
    row = await merchant_repo.get_public_qr_merchant(db, qr_id)
    if not row:
        raise HTTPException(status_code=404, detail="Merchant not found.")
    
    return {
        "id": row.get("id"),
        "shopName": row.get("shopName"),
        "tradeName": row.get("tradeName"),
        "gstin": row.get("gstin"),
        "state": row.get("state"),
        "city": row.get("city"),
        "status": row.get("status"),
        "logoUrl": row.get("logoUrl"),
        "qrId": row.get("qrId"),
        "planExpiresAt": row.get("planExpiresAt"),
        "planValidityDays": row.get("planValidityDays"),
        "invoicePrefix": row.get("invoicePrefix"),
        "brandColor": row.get("brandColor"),
        "brandName": row.get("brandName")
    }


@public_router.get("/merchants/{merchant_id}")
async def get_public_merchant(merchant_id: str, db: AsyncSession = Depends(get_db)):
    """Retrieve public merchant details by merchant ID without authentication."""
    row = await merchant_repo.get_by_id(db, merchant_id)
    if not row:
        raise HTTPException(status_code=404, detail="Merchant not found.")
    
    return {
        "id": row.get("id"),
        "shopName": row.get("shopName"),
        "tradeName": row.get("tradeName"),
        "gstin": row.get("gstin"),
        "state": row.get("state"),
        "status": row.get("status"),
        "logoDataUrl": row.get("logoDataUrl"),
        "qrId": row.get("qrId"),
        "planExpiresAt": row.get("planExpiresAt"),
        "planValidityDays": row.get("planValidityDays"),
        "invoicePrefix": row.get("invoicePrefix"),
        "brandColor": row.get("brandColor"),
        "brandName": row.get("brandName")
    }


@public_router.get("/merchants/by-request/{request_id}")
async def get_merchant_by_request(request_id: str, db: AsyncSession = Depends(get_db)):
    """Retrieve merchant details by Request ID without authentication.
    Authorized by possession of the unguessable request_id token.
    Used by the customer flow to render the complete invoice PDF/HTML."""
    req = await billing_repo.get_request(db, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found.")
        
    if req.get("status") != "approved":
        raise HTTPException(status_code=403, detail="Request is not approved yet.")
        
    merchant = await merchant_repo.get_by_id(db, req.get("merchantId"))
    if not merchant:
        raise HTTPException(status_code=404, detail="Merchant not found.")
        
    return {
        "id": merchant.get("id"),
        "shopName": merchant.get("shopName"),
        "tradeName": merchant.get("tradeName"),
        "gstin": merchant.get("gstin"),
        "pan": merchant.get("pan"),
        "state": merchant.get("state"),
        "city": merchant.get("city"),
        "pincode": merchant.get("pincode"),
        "address": merchant.get("address"),
        "phone": merchant.get("phone"),
        "email": merchant.get("email"),
        "logoDataUrl": merchant.get("logoDataUrl"),
        "companySealDataUrl": merchant.get("companySealDataUrl"),
        "signatureDataUrl": merchant.get("signatureDataUrl"),
        "bankName": merchant.get("bankName"),
        "accountType": merchant.get("accountType"),
        "accountNumber": merchant.get("accountNumber"),
        "ifsc": merchant.get("ifsc"),
        "upiId": merchant.get("upiId"),
        "invoicePrefix": merchant.get("invoicePrefix"),
        "brandColor": merchant.get("brandColor"),
        "brandName": merchant.get("brandName")
    }


# ---------------- merchant (JWT-scoped) ----------------

@merchant_router.get("/billing-requests")
async def list_my_requests(merchant_id: str = Depends(require_merchant), db: AsyncSession = Depends(get_db)):
    rows = await billing_repo.list_by_merchant(db, merchant_id)
    return {"requests": rows}


@merchant_router.patch("/billing-requests/{request_id}")
async def patch_my_request(
    request_id: str,
    payload: BillingRequestPatchIn,
    merchant_id: str = Depends(require_merchant),
    db: AsyncSession = Depends(get_db),
):
    existing = await billing_repo.get_request(db, request_id)
    if not existing or existing["merchantId"] != merchant_id:
        raise HTTPException(404, "Request not found.")
    if existing["status"] != "pending":
        raise HTTPException(409, "This request has already been resolved.")

    patch = {
        k: v for k, v in payload.model_dump(exclude_unset=True).items()
        if k in billing_repo.REQUEST_SELF_EDITABLE_FIELDS
    }
    if not patch:
        return {"ok": True, "request": existing}
    updated = await billing_repo.update_request(db, request_id, patch)
    return {"ok": True, "request": updated}


@merchant_router.post("/billing-requests/{request_id}/reject")
async def reject_my_request(
    request_id: str,
    payload: BillingRequestRejectIn,
    merchant_id: str = Depends(require_merchant),
    db: AsyncSession = Depends(get_db),
):
    existing = await billing_repo.get_request(db, request_id)
    if not existing or existing["merchantId"] != merchant_id:
        raise HTTPException(404, "Request not found.")
    if existing["status"] != "pending":
        raise HTTPException(409, "This request has already been resolved.")

    updated = await billing_repo.update_request(db, request_id, {
        "status": "rejected",
        "rejectReason": payload.reason,
        "notes": payload.reason,
        "resolvedAt": plans_ms.now_ms(),
    })
    return {"ok": True, "request": updated}


@merchant_router.get("/invoices")
async def list_my_invoices(merchant_id: str = Depends(require_merchant), db: AsyncSession = Depends(get_db)):
    rows = await billing_repo.list_invoices_by_merchant(db, merchant_id)
    return {"invoices": rows}


@merchant_router.post("/invoices")
async def approve_and_create_invoice(
    payload: InvoiceApproveIn,
    merchant_id: str = Depends(require_merchant),
    db: AsyncSession = Depends(get_db),
):
    """Atomically creates the invoice and flips its request to 'approved' —
    see billing_repo.approve_request_with_invoice. Ownership + pending-
    status are re-checked here, server-side, regardless of what the
    frontend's own (already suspended/credit-gated) UI thinks the request
    looks like — a merchant can never approve another merchant's request,
    and a request can never be approved twice.

    TAX FIGURES ARE SERVER-COMPUTED, NEVER TRUSTED FROM THE CLIENT (audit
    finding 5.1 — "No Server-Side Tax Verification", High). The frontend
    still sends taxableValue/cgst/sgst/igst/... for backwards-compatible
    display purposes, but every one of those values is now recomputed
    here from payload.items via gst_engine.compute() — the exact same
    engine src/lib/gstEngine.ts's computeInvoice() is a Python port of —
    and the recomputed figures are what actually gets persisted. A
    merchant tampering with the outgoing request (e.g. via dev tools) can
    no longer make an invoice's stored tax figures diverge from its own
    line items."""
    merchant = await merchant_repo.get_by_id(db, merchant_id)
    if not merchant:
        raise HTTPException(404, "Merchant not found.")
    if merchant.get("status") in ("suspended", "disabled"):
        raise HTTPException(403, "This account has been suspended and cannot generate invoices.")

    items = [i if isinstance(i, dict) else dict(i) for i in payload.items]
    if not items:
        raise HTTPException(400, "At least one line item is required.")
    try:
        for it in items:
            float(it["qty"]); float(it["rate"]); float(it["gstRate"])
    except (KeyError, TypeError, ValueError):
        raise HTTPException(400, "Each item requires numeric qty, rate, and gstRate.")

    is_inter_state, place_of_supply = gst_engine.resolve_supply(
        merchant.get("state") or "", merchant.get("gstin") or "",
        payload.customerGstin, payload.customerState,
    )
    comp = gst_engine.compute(items, is_inter_state, place_of_supply)

    now = plans_ms.now_ms()
    invoice_id = f"inv_{secrets.token_hex(10)}"
    invoice_row = {
        "id": invoice_id,
        "requestId": payload.requestId,
        "merchantId": merchant_id,
        "invoiceNo": payload.invoiceNo,
        "invoiceNumber": payload.invoiceNumber,
        "invoiceDate": now,
        "customerName": payload.customerName,
        "customerPhone": payload.customerPhone,
        "customerEmail": payload.customerEmail,
        "customerGstin": payload.customerGstin,
        "customerPan": payload.customerPan,
        "customerAddress": payload.customerAddress,
        "customerState": payload.customerState,
        "paymentMode": payload.paymentMode,
        "paymentRef": payload.paymentRef,
        "notes": payload.notes,
        "items": payload.items,
        # ---- server-computed, authoritative tax figures (see docstring) ----
        "taxableValue": comp.taxable_value,
        "cgst": comp.cgst,
        "sgst": comp.sgst,
        "igst": comp.igst,
        "totalTax": comp.total_tax,
        "roundOff": comp.round_off,
        "grandTotal": comp.grand_total,
        "amountInWords": comp.amount_in_words,
        "placeOfSupply": comp.place_of_supply,
        "isInterState": comp.is_inter_state,
        "branded": payload.branded,
        "createdAt": now,
    }
    request_patch = {
        "status": "approved",
        "invoiceNo": payload.invoiceNo,
        "invoiceNumber": payload.invoiceNumber,
        "invoiceId": invoice_id,
        "items": payload.items,
        "resolvedAt": now,
        "customerName": payload.customerName,
        "customerPhone": payload.customerPhone,
        "customerEmail": payload.customerEmail,
        "customerGstin": payload.customerGstin,
        "customerPan": payload.customerPan,
        "customerAddress": payload.customerAddress,
        "customerState": payload.customerState,
    }

    result = await billing_repo.approve_request_with_invoice(db, payload.requestId, merchant_id, invoice_row, request_patch)
    if not result:
        raise HTTPException(409, "Request not found, already resolved, or not yours.")
    saved_invoice, saved_request = result

    # 1. Deduct Stock from Master Inventory
    for it in payload.items:
        it_dict = it if isinstance(it, dict) else dict(it)
        qty = float(it_dict.get("qty") or it_dict.get("quantity") or 1)
        item_id = it_dict.get("inventoryItemId") or it_dict.get("inventory_item_id")
        if item_id:
            try:
                await inventory_repo.deduct_stock(db, item_id, merchant_id, qty)
            except Exception as inv_err:
                logger.error(f"Error deducting stock by id: {inv_err}")
        elif it_dict.get("name") or it_dict.get("description"):
            p_name = (it_dict.get("name") or it_dict.get("description") or "").strip()
            try:
                inv_match = await db.execute(
                    text("SELECT id FROM public.merchant_inventory WHERE merchant_id = :mid AND LOWER(product_name) = LOWER(:pname) AND is_active = true LIMIT 1"),
                    {"mid": merchant_id, "pname": p_name}
                )
                match_row = inv_match.first()
                if match_row:
                    await inventory_repo.deduct_stock(db, match_row[0], merchant_id, qty)
            except Exception as inv_err:
                logger.error(f"Error deducting stock by name: {inv_err}")

    # 2. Post Double-Entry Accounting Journal Entry (Debits == Credits)
    try:
        await accounting_repo.post_invoice_journal(db, merchant_id, invoice_row, commit=True)
    except Exception as acc_err:
        logger.error(f"Error posting invoice journal: {acc_err}")

    return {"ok": True, "invoice": saved_invoice, "request": saved_request}


# ---------------- admin (read-only) ----------------

@admin_router.get("/billing-requests")
async def list_all_requests(_admin: str = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    rows = await billing_repo.list_all_requests(db)
    return {"requests": rows}


@admin_router.get("/invoices")
async def list_all_invoices(_admin: str = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    rows = await billing_repo.list_all_invoices(db)
    return {"invoices": rows}
