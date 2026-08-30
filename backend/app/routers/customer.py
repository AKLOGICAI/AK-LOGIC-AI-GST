"""
customer.py — FastAPI router for Customer Vault realm (/api/customer/*).

Features:
- Customer Registration (verifies OTP resetToken, assigns AKC-00000001 code, hashes PIN, stores billing fields)
- Customer Login (accepts phone OR AKC-00000001 identifier + PIN, issues JWT with realm="customer")
- Customer Reset PIN (verifies OTP resetToken)
- GET /me (profile)
- GET /invoices (customer's full invoice history across all merchants)
- Merchant Customer Search (GET /merchant/customer-search - Verified Merchants, returns masked data)
- Merchant Customer Select (POST /merchant/customer-select - Verified Merchants, returns unmasked billing fields + logs audit)
- Merchant Customer Autofill (POST /merchant/customer-autofill - Normal Merchants, verifies AKC ID + PIN + contextual lockout + logs audit)
"""
from typing import Optional, Any, Dict, List
import re
import secrets
import time
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from .. import security, customer_repo, billing_repo, rate_limit_repo
from ..schemas import CustomerRegisterIn, CustomerLoginIn, CustomerResetPinIn, CustomerSelectIn, CustomerAutofillIn

router = APIRouter(tags=["customer"])

# SECURITY-AUDIT CUST-001 (HIGH): customer-search / customer-select used to
# have no rate limiting at all, and customer-select never verified that a
# masked search for the SAME code had actually happened first (the two-step
# UI flow was a frontend-only convention). Combined with sequentially
# generated AKC-xxxxxxxx codes, this let any verified-merchant account
# enumerate the full unmasked PII of every customer in the database with a
# simple incrementing loop. Fixed by (1) rate-limiting both endpoints per
# merchant and per IP, and (2) requiring select to be preceded by a genuine
# search for that exact code within a short window (see _SELECT_GATE_* below).
_SEARCH_WINDOW_MAX = 20
_SEARCH_WINDOW_SECONDS = 5 * 60
_SELECT_WINDOW_MAX = 20
_SELECT_WINDOW_SECONDS = 5 * 60
_SELECT_GATE_TTL_SECONDS = 10 * 60


def _normalize_phone(phone: str) -> str:
    cleaned = re.sub(r"\D", "", phone)
    if len(cleaned) == 10:
        return f"+91{cleaned}"
    if not phone.startswith("+"):
        return f"+{cleaned}"
    return phone


def _public_customer(c: dict) -> dict:
    """Strip pin hash before returning to frontend."""
    out = dict(c)
    out.pop("pin", None)
    return out


def _select_gate_key(merchant_id: str, customer_code: str) -> str:
    return f"custselect_gate:{merchant_id}:{customer_code.strip().upper()}"


@router.post("/register")
async def register_customer(
    body: CustomerRegisterIn,
    db: AsyncSession = Depends(get_db),
):
    norm_phone = _normalize_phone(body.phone)

    # 1. Verify OTP reset token
    security.verify_reset_token(body.resetToken, norm_phone)

    # 2. Check if phone already registered
    existing = await customer_repo.get_by_phone(db, norm_phone)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A customer account with this mobile number already exists. Please log in.",
        )

    # 3. Generate AKC ID and hash PIN (or auto-generate default 4-digit PIN)
    customer_code = await customer_repo.next_customer_code(db)
    
    raw_pin = body.pin.strip() if body.pin and body.pin.strip() else f"{secrets.randbelow(9000) + 1000}"
    pin_hash = security.hash_mpin(raw_pin)
    now = int(time.time() * 1000)

    row = {
        "id": secrets.token_urlsafe(16),
        "customerCode": customer_code,
        "name": body.name.strip(),
        "phone": norm_phone,
        "pin": pin_hash,
        "email": body.email.strip() if body.email else None,
        "gstin": body.gstin.strip().upper() if body.gstin else None,
        "billingAddress": body.billingAddress.strip() if body.billingAddress else None,
        "companyName": body.companyName.strip() if body.companyName else None,
        "state": body.state.strip() if body.state else None,
        "status": "active",
        "createdAt": now,
        "lastLoginAt": now,
    }

    created = await customer_repo.insert(db, row)
    token = security.create_token(subject=created["id"], realm="customer")

    return {
        "ok": True,
        "token": token,
        "customer": _public_customer(created),
        "defaultPin": raw_pin if not body.pin else None,
    }


@router.post("/login")
async def login_customer(
    body: CustomerLoginIn,
    db: AsyncSession = Depends(get_db),
):
    identifier = body.identifier.strip()
    now = int(time.time() * 1000)

    # Server-side brute-force lockout check
    lock_key = f"login_lock:customer:{identifier.lower()}"
    locked_until = await rate_limit_repo.check_lockout(db, lock_key)
    if locked_until and locked_until > time.time():
        wait_min = int((locked_until - time.time()) // 60) + 1
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many incorrect attempts. Try again in {wait_min} minute(s).",
        )

    # Determine identifier type: AKC-XXXXXXXX or phone number
    if identifier.upper().startswith("AKC-"):
        customer = await customer_repo.get_by_customer_code(db, identifier)
    else:
        norm_phone = _normalize_phone(identifier)
        customer = await customer_repo.get_by_phone(db, norm_phone)

    if not customer or customer.get("status") in ("suspended", "disabled"):
        just_locked = await rate_limit_repo.record_failed_login(db, lock_key, 5, 15 * 60)
        if just_locked:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many incorrect attempts. Try again in 15 minutes.",
            )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Mobile Number / AKC ID or PIN.",
        )

    # Verify PIN (bcrypt)
    if not security.verify_mpin(body.pin, customer["pin"]):
        just_locked = await rate_limit_repo.record_failed_login(db, lock_key, 5, 15 * 60)
        if just_locked:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many incorrect attempts. Try again in 15 minutes.",
            )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Mobile Number / AKC ID or PIN.",
        )

    await rate_limit_repo.clear_lockout(db, lock_key)
    await customer_repo.update(db, customer["id"], {"lastLoginAt": now})

    token = security.create_token(subject=customer["id"], realm="customer")

    return {
        "ok": True,
        "token": token,
        "customer": _public_customer(customer),
    }


@router.post("/reset-pin")
async def reset_customer_pin(
    body: CustomerResetPinIn,
    db: AsyncSession = Depends(get_db),
):
    if "@" in body.phone:
        lookup_key = body.phone.lower().strip()
        customer = await customer_repo.get_by_email(db, lookup_key)
        security.verify_reset_token(body.resetToken, lookup_key)
    else:
        norm_phone = _normalize_phone(body.phone)
        customer = await customer_repo.get_by_phone(db, norm_phone)
        security.verify_reset_token(body.resetToken, norm_phone)

    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No customer account found with this email or phone.",
        )

    new_hash = security.hash_mpin(body.newPin)
    await customer_repo.update(db, customer["id"], {"pin": new_hash})

    return {"ok": True, "message": "PIN reset successfully. You can now log in."}


@router.get("/me")
async def get_current_customer(
    customer_id: str = Depends(security.require_customer),
    db: AsyncSession = Depends(get_db),
):
    customer = await customer_repo.get_by_id(db, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return _public_customer(customer)


@router.get("/invoices")
async def get_customer_invoices(
    customer_id: str = Depends(security.require_customer),
    db: AsyncSession = Depends(get_db),
):
    customer = await customer_repo.get_by_id(db, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    invoices = await billing_repo.list_invoices_by_customer_phone(db, customer["phone"])
    return invoices


# ==========================================
# Merchant Customer Lookup Endpoints (2-Tier)
# ==========================================

@router.get("/merchant/customer-search")
async def search_customer_masked(
    q: str,
    req: Request,
    merchant_data: tuple[str, dict] = Depends(security.require_verified_merchant),
    db: AsyncSession = Depends(get_db),
):
    """Tier 1 — Verified Merchant Masked Search (Step 1 of privacy flow)."""
    merchant_id, merchant = merchant_data
    clean_q = q.strip()
    if not clean_q:
        return {"found": False}

    client_ip = req.client.host if req.client else "unknown"

    # CUST-001 fix: per-merchant AND per-IP rate limit — stops a
    # verified-merchant account (legitimate, leaked, or malicious) from
    # sweeping through the sequential AKC-code space at scale.
    over_merchant_limit = await rate_limit_repo.check_and_increment_window(
        db, f"custsearch:merchant:{merchant_id}", _SEARCH_WINDOW_MAX, _SEARCH_WINDOW_SECONDS
    )
    over_ip_limit = await rate_limit_repo.check_and_increment_window(
        db, f"custsearch:ip:{client_ip}", _SEARCH_WINDOW_MAX, _SEARCH_WINDOW_SECONDS
    )
    if over_merchant_limit or over_ip_limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many customer lookups. Please wait a few minutes and try again.",
        )

    masked = await customer_repo.get_masked_profile(db, clean_q)

    # Audit Log
    user_agent = req.headers.get("user-agent", "unknown")
    await customer_repo.log_lookup_audit(db, {
        "merchantId": merchant_id,
        "merchantKycStatus": merchant.get("kyc", "verified"),
        "lookupQuery": clean_q,
        "actionType": "search_masked",
        "ipAddress": client_ip,
        "deviceInfo": user_agent[:200],
        "success": bool(masked),
    })

    if not masked:
        return {"found": False}

    # CUST-001 fix: open a short-lived "select gate" scoped to this
    # merchant + this exact customer code. customer-select now REQUIRES
    # this gate to be open — this closes the bypass where select could be
    # called directly with a guessed code without ever going through the
    # masked search step (which was previously just a frontend UI
    # convention, not something the backend enforced).
    await rate_limit_repo.put(
        db,
        _select_gate_key(merchant_id, masked["customerCode"]),
        {"opened_at": time.time()},
        purge_after=time.time() + _SELECT_GATE_TTL_SECONDS,
    )

    return {"found": True, "customer": masked}


@router.post("/merchant/customer-select")
async def select_customer_unmasked(
    body: CustomerSelectIn,
    req: Request,
    merchant_data: tuple[str, dict] = Depends(security.require_verified_merchant),
    db: AsyncSession = Depends(get_db),
):
    """Tier 1 — Verified Merchant Customer Selection (Step 2 unmasking for invoice creation)."""
    merchant_id, merchant = merchant_data
    code = body.customerCode.strip()
    client_ip = req.client.host if req.client else "unknown"

    # CUST-001 fix: rate limit (defense in depth alongside the gate below).
    over_merchant_limit = await rate_limit_repo.check_and_increment_window(
        db, f"custselect:merchant:{merchant_id}", _SELECT_WINDOW_MAX, _SELECT_WINDOW_SECONDS
    )
    over_ip_limit = await rate_limit_repo.check_and_increment_window(
        db, f"custselect:ip:{client_ip}", _SELECT_WINDOW_MAX, _SELECT_WINDOW_SECONDS
    )
    if over_merchant_limit or over_ip_limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many customer lookups. Please wait a few minutes and try again.",
        )

    # CUST-001 fix: this merchant must have genuinely searched for this
    # EXACT code (masked step) within the last 10 minutes. A guessed code
    # that was never searched has no gate open, so select is refused —
    # eliminating the enumerate-unmasked-PII-directly attack path.
    gate_key = _select_gate_key(merchant_id, code)
    gate = await rate_limit_repo.get(db, gate_key)
    if not gate:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Please search for this customer first before selecting them.",
        )

    unmasked = await customer_repo.get_unmasked_billing_profile(db, code)
    
    # Audit Log
    user_agent = req.headers.get("user-agent", "unknown")
    await customer_repo.log_lookup_audit(db, {
        "merchantId": merchant_id,
        "merchantKycStatus": merchant.get("kyc", "verified"),
        "lookupQuery": code,
        "actionType": "select_unmasked",
        "ipAddress": client_ip,
        "deviceInfo": user_agent[:200],
        "success": bool(unmasked),
    })

    if not unmasked:
        raise HTTPException(status_code=404, detail="Customer not found")

    return {"ok": True, "customer": unmasked}


@router.post("/merchant/customer-autofill")
async def autofill_customer_with_pin(
    body: CustomerAutofillIn,
    req: Request,
    merchant_id: str = Depends(security.require_merchant),
    db: AsyncSession = Depends(get_db),
):
    """Tier 2 — Normal Merchant PIN-Verified Autofill (Contextual Lockout + Audit Log)."""
    code = body.customerCode.strip()
    pin = body.pin.strip()
    now = int(time.time() * 1000)
    client_ip = req.client.host if req.client else "unknown"
    user_agent = req.headers.get("user-agent", "unknown")

    # Contextual lockout key: merchantId + code + ipAddress (protects customer from global lockout!)
    lock_key = f"autofill_lock:{merchant_id}:{code.upper()}:{client_ip}"
    locked_until = await rate_limit_repo.check_lockout(db, lock_key)
    if locked_until and locked_until > time.time():
        wait_min = int((locked_until - time.time()) // 60) + 1
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many incorrect PIN attempts for this customer. Try again in {wait_min} minute(s).",
        )

    customer = await customer_repo.get_by_customer_code(db, code)
    if not customer or customer.get("status") in ("suspended", "disabled"):
        just_locked = await rate_limit_repo.record_failed_login(db, lock_key, 5, 15 * 60)
        await customer_repo.log_lookup_audit(db, {
            "merchantId": merchant_id,
            "merchantKycStatus": "normal",
            "lookupQuery": code,
            "actionType": "pin_autofill",
            "ipAddress": client_ip,
            "deviceInfo": user_agent[:200],
            "success": False,
        })
        if just_locked:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many incorrect PIN attempts. Locked out for 15 minutes.",
            )
        raise HTTPException(status_code=401, detail="Invalid AKC ID or PIN.")

    if not security.verify_mpin(pin, customer["pin"]):
        just_locked = await rate_limit_repo.record_failed_login(db, lock_key, 5, 15 * 60)
        await customer_repo.log_lookup_audit(db, {
            "merchantId": merchant_id,
            "merchantKycStatus": "normal",
            "customerId": customer["id"],
            "lookupQuery": code,
            "actionType": "pin_autofill",
            "ipAddress": client_ip,
            "deviceInfo": user_agent[:200],
            "success": False,
        })
        if just_locked:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many incorrect PIN attempts. Locked out for 15 minutes.",
            )
        raise HTTPException(status_code=401, detail="Invalid AKC ID or PIN.")

    # Success: clear lockout and log audit
    await rate_limit_repo.clear_lockout(db, lock_key)
    await customer_repo.log_lookup_audit(db, {
        "merchantId": merchant_id,
        "merchantKycStatus": "normal",
        "customerId": customer["id"],
        "lookupQuery": code,
        "actionType": "pin_autofill",
        "ipAddress": client_ip,
        "deviceInfo": user_agent[:200],
        "success": True,
    })

    unmasked = await customer_repo.get_unmasked_billing_profile(db, code)
    return {"ok": True, "customer": unmasked}


# ==========================================
# Primary Merchant Endpoints (Module 2)
# ==========================================

class SetPrimaryMerchantIn(BaseModel):
    merchantId: Optional[str] = None
    merchantCode: Optional[str] = None


@router.get("/primary-merchant")
async def get_my_primary_merchant(
    customer_id: str = Depends(security.require_customer),
    db: AsyncSession = Depends(get_db),
):
    """Get the customer's currently designated Primary Merchant."""
    pm = await customer_repo.get_primary_merchant(db, customer_id)
    return {"ok": True, "primaryMerchant": pm}


@router.post("/primary-merchant/set")
async def set_my_primary_merchant(
    body: SetPrimaryMerchantIn,
    request: Request,
    customer_id: str = Depends(security.require_customer),
    db: AsyncSession = Depends(get_db),
):
    """Designate or update the Primary Merchant for this customer.

    Gated by primary_merchant_enabled (2026-08-23 fix): this endpoint was
    previously reachable unconditionally regardless of the flag's value —
    the flag existed in network_feature_flags but nothing ever checked it
    here, so Module 2 was effectively always "on" for every customer.
    Checked against the TARGET merchant (the one being designated), since
    that's whose routing/queue behavior this feature affects — matching
    how deep_accounting_enabled is checked against the merchant whose
    books are being posted to, not some unrelated party.
    """
    from .. import merchant_repo, feature_flags_repo
    target_mid = body.merchantId
    if not target_mid and body.merchantCode:
        m = await merchant_repo.get_by_id_light(db, body.merchantCode)
        if not m:
            m = await merchant_repo.get_by_phone_light(db, body.merchantCode)
        if m:
            target_mid = m["id"]

    if not target_mid:
        raise HTTPException(400, "Please provide a valid merchantId or merchantCode.")

    if not await feature_flags_repo.is_enabled(db, "primary_merchant_enabled", merchant_id=target_mid):
        raise HTTPException(403, "Primary Merchant feature is not yet enabled for this merchant.")

    client_ip = request.client.host if request.client else ""
    success = await customer_repo.set_primary_merchant(db, customer_id, target_mid, ip_address=client_ip)
    if not success:
        raise HTTPException(404, "Merchant not found or could not be set.")

    pm = await customer_repo.get_primary_merchant(db, customer_id)
    return {"ok": True, "message": "Primary Merchant designated successfully.", "primaryMerchant": pm}


@router.post("/primary-merchant/remove")
async def remove_my_primary_merchant(
    request: Request,
    customer_id: str = Depends(security.require_customer),
    db: AsyncSession = Depends(get_db),
):
    """Remove the designated Primary Merchant (Customer has 100% control).

    Deliberately NOT flag-gated: removing an existing relationship should
    always be allowed even if the feature is later disabled for that
    merchant — blocking removal could trap a customer in a relationship
    they no longer want, which is worse than the feature being "off".
    """
    client_ip = request.client.host if request.client else ""
    await customer_repo.remove_primary_merchant(db, customer_id, ip_address=client_ip)
    return {"ok": True, "message": "Primary Merchant removed."}
