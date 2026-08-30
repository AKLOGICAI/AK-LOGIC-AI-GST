"""Merchant realm — registration, login, self-service profile & plan
purchase, all authenticated with the merchant JWT (security.require_merchant)
instead of the public Supabase anon key.

WHY THIS FILE EXISTS: see supabase/migrations/0005_merchants_lockdown.sql
and merchant_repo.py's docstring. Before this, every merchant write
(register/login/profile-edit/plan-purchase) happened directly from the
browser against Supabase with `using (true)` / `with check (true)` RLS
policies — the single highest-risk finding in the security audit
(SECURITY_FIX_SUMMARY.md). This router is Phase 2: the actual fix.

It also fixes a second, independent bug found while doing this: the
admin/subscription "write" functions in src/lib/services.ts
(adminService.setStatus/adjustCredits/..., subscriptionService.
purchasePlan/extendValidity/consumeCredit) mutated ONLY the local
browser's localStorage cache (`db.merchants` is a plain `Table`, not a
`RemoteTable`) — they never reached Supabase at all. An admin suspending
a merchant, or a merchant buying a plan, had no durable effect beyond the
tab that clicked the button. Every one of those mutations now goes
through this router (or admin.py's merchant endpoints) instead.
"""
import hashlib
import hmac
import logging
import secrets
import time

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

import base64

from .. import merchant_repo, payment_repo, plans_ms, rate_limit_repo, support_ticket_repo, push_service, hsn_learning_repo, billing_repo, storage_service, ocr_service
from ..config import settings
from ..database import get_db
from ..schemas import (
    ConsumeCreditIn,
    CreatePaymentOrderIn,
    ExtendValidityIn,
    MerchantChangeMpinIn,
    MerchantLoginIn,
    MerchantRegisterIn,
    OcrScanIn,
    MerchantResetMpinIn,
    MerchantUpdateIn,
    PurchasePlanIn,
    RefundCreditIn,
    VerifyPaymentIn,
    TicketCreateIn,
    HsnLearningRecordIn,
    ProductIntelligenceResponse,
    MerchantBehaviourResponse,
    MerchantRelationshipResponse,
    BrandingUploadIn,
)
from ..security import create_token, hash_mpin, require_merchant, verify_mpin_any, verify_reset_token

logger = logging.getLogger("merchant")

router = APIRouter(tags=["merchant"])

# ---------------- server-side login lockout ----------------
# Mirrors main.py's OTP throttle exactly (same shape/thresholds) — closes
# SECURITY_FIX_SUMMARY.md item 15 ("client-side soft-lock ... documented as
# non-authoritative pending the backend migration"). This IS that migration:
# the client-side lock in MerchantLogin.tsx remains as a UX nicety, but this
# is now the real, unbypassable boundary.
#
# Previously an in-memory `_login_locks: Dict[str, LoginLock]` — broken
# across multiple workers/instances (a phone number locked out on worker A
# could keep brute-forcing freely on worker B). Now backed by Postgres via
# rate_limit_repo.py, shared cluster-wide the same way `public.merchants`
# already is.
LOGIN_MAX_ATTEMPTS = 5
LOGIN_LOCKOUT_SECONDS = 15 * 60


def _lock_key(phone: str) -> str:
    return f"login_lock:merchant:{phone}"


async def _check_lock(db: AsyncSession, phone: str) -> None:
    locked_until = await rate_limit_repo.check_lockout(db, _lock_key(phone))
    if locked_until:
        wait_min = int((locked_until - time.time()) // 60) + 1
        raise HTTPException(429, f"Too many incorrect attempts. Try again in {wait_min} minute(s).")


async def _record_failure(db: AsyncSession, phone: str) -> None:
    await rate_limit_repo.record_failed_login(db, _lock_key(phone), LOGIN_MAX_ATTEMPTS, LOGIN_LOCKOUT_SECONDS)


async def _clear_lock(db: AsyncSession, phone: str) -> None:
    await rate_limit_repo.clear_lockout(db, _lock_key(phone))


def _normalize_phone(phone: str) -> str:
    return phone if phone.startswith("+") else f"+91{phone}"


def _public_merchant(m: dict) -> dict:
    """Strip the MPIN digest before a merchant record ever leaves the
    backend — even to the merchant themself, the frontend never needs it."""
    return {k: v for k, v in m.items() if k != "mpin"}


def _public_merchant_light(m: dict) -> dict:
    """Strip MPIN and exclude massive Base64 images when Supabase Storage URLs are present to keep response < 3KB."""
    pub = {k: v for k, v in m.items() if k != "mpin"}
    if pub.get("logoUrl") and pub.get("logoDataUrl"):
        pub["logoDataUrl"] = None
    if pub.get("signatureUrl") and pub.get("signatureDataUrl"):
        pub["signatureDataUrl"] = None
    if pub.get("companySealUrl") and pub.get("companySealDataUrl"):
        pub["companySealDataUrl"] = None
    return pub


def _secure_random_suffix(length: int = 12) -> str:
    return secrets.token_hex(length)[:length].upper()


# ---------------- shared creation path (self-service register + admin-created) ----------------
# Both the merchant's own /register call below AND the admin console's
# "add merchant manually" flow (routers/admin.py: POST /admin/merchants)
# funnel through this single function, so an admin-created merchant is
# byte-for-byte the same shape/validation as a self-registered one — same
# bcrypt MPIN hashing, same QR id / merchant code generation, same
# duplicate-phone guard. The only difference is who supplied the MPIN and
# that no merchant JWT is minted here (the admin isn't logging in as the
# merchant; the merchant logs in themselves afterwards with the phone +
# MPIN the admin set).
async def create_merchant_record(db: AsyncSession, payload: MerchantRegisterIn) -> dict:
    phone = _normalize_phone(payload.phone)

    # GSTIN is the sole strict unique business identifier.
    if payload.gstin and payload.gstin.strip():
        existing_gstin = await merchant_repo.get_by_gstin(db, payload.gstin)
        if existing_gstin:
            raise HTTPException(409, "This GSTIN is already registered.")

    qr_prefix = "".join(ch for ch in payload.shopName if ch.isalpha())[:6].upper() or "SHOP"
    qr_id = f"AK-{qr_prefix}-{_secure_random_suffix()}"

    invoice_prefix = (payload.invoicePrefix or "").strip().upper() or (
        "".join(ch for ch in payload.shopName if ch.isalpha())[:3].upper() or "INV"
    )

    # Permanent Merchant ID (AKM-000001, AKM-000002, ...) — generated once,
    # here, by the backend only. It never changes and is never reused (see
    # merchant_repo.next_merchant_code). This is separate from the internal
    # `id` primary key (still a random token) so every existing FK/join on
    # merchants.id is completely unaffected.
    merchant_code = await merchant_repo.next_merchant_code(db)

    now = plans_ms.now_ms()
    merchant = {
        "id": secrets.token_hex(16),
        "merchantCode": merchant_code,
        "invoiceSeq": 0,
        "shopName": payload.shopName,
        "ownerName": payload.ownerName,
        "legalName": payload.legalName,
        "tradeName": payload.tradeName,
        "businessType": payload.businessType,
        "email": payload.email,
        "phone": phone,
        "mpin": hash_mpin(payload.mpin),
        "gstin": payload.gstin,
        "pan": payload.pan.upper().strip(),
        "address": payload.address,
        "state": payload.state,
        "city": payload.city,
        "pincode": payload.pincode,
        "bankName": payload.bankName,
        "accountType": payload.accountType,
        "accountNumber": payload.accountNumber,
        "ifsc": payload.ifsc,
        "signatureDataUrl": payload.signatureDataUrl,
        "upiId": payload.upiId,
        "invoicePrefix": invoice_prefix,
        "qrId": qr_id,
        "status": "active",
        "planId": plans_ms.FREE_PLAN.id,
        "planName": plans_ms.FREE_PLAN.name,
        "planValidityDays": 0,
        "planStartedAt": now,
        "planExpiresAt": 0,
        "pdfCredits": 0,
        "customBranding": False,
        "plan": "recharge",
        "balance": 0,
        "createdAt": now,
    }

    try:
        return await merchant_repo.insert(db, merchant)
    except Exception:
        logger.exception("merchant creation insert failed")
        raise HTTPException(500, "Could not create merchant. Please try again.")


# ---------------- register ----------------
@router.post("/register")
async def register(payload: MerchantRegisterIn, db: AsyncSession = Depends(get_db)):
    saved = await create_merchant_record(db, payload)
    token = create_token(subject=saved["id"], realm="merchant", mpin_hash=saved["mpin"])
    return {"ok": True, "token": token, "merchant": _public_merchant(saved)}


# ---------------- AI Document Autofill (GST/Bank document scanner) ----------------
# Rate limits reuse the EXISTING rate_limit_repo.check_and_increment_window
# machinery (same one backing OTP/login lockouts) but with brand-new,
# isolated keys under the "ocr:" namespace — nothing here touches or
# shares state with any existing OTP/login/payment rate limit.
#
# Approved limits (per merchant/phone, plus one platform-wide cap):
#   3 attempts / 10 minutes, 15 attempts / 24 hours, 60 attempts / 30 days,
#   5,000 OCR images / month platform-wide.
async def _check_ocr_rate_limits(db: AsyncSession, phone: str) -> None:
    import calendar
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    days_in_month = calendar.monthrange(now.year, now.month)[1]
    seconds_left_in_month = max(3600.0, (days_in_month - now.day + 1) * 86400.0)

    windows = [
        (f"ocr:merchant:{phone}:10min", 3, 600.0),
        (f"ocr:merchant:{phone}:24h", 15, 86400.0),
        (f"ocr:merchant:{phone}:30d", 60, 30 * 86400.0),
        (f"ocr:platform:{now.strftime('%Y-%m')}", 5000, seconds_left_in_month),
    ]
    for key, max_requests, window_seconds in windows:
        limited = await rate_limit_repo.check_and_increment_window(db, key, max_requests, window_seconds)
        if limited:
            raise HTTPException(
                status_code=429,
                detail="Scan limit reached for now. Please try again later, or enter the details manually.",
            )


@router.post("/ocr-scan")
async def ocr_scan(payload: OcrScanIn, db: AsyncSession = Depends(get_db)):
    if not ocr_service.is_configured():
        # Feature-optional, same pattern as msg91/razorpay elsewhere in
        # this file: manual entry must keep working even if OCR isn't set up.
        raise HTTPException(status_code=503, detail="Document scan is temporarily unavailable. Please enter details manually.")

    phone = _normalize_phone(payload.phone)
    await _check_ocr_rate_limits(db, phone)

    try:
        text = await ocr_service.extract_text(payload.imageBase64)
    except Exception:
        logger.exception("[OCR] Vision extraction failed for documentType=%s", payload.documentType)
        raise HTTPException(status_code=502, detail="Could not read the document. Please retake the photo or enter details manually.")

    fields = ocr_service.extract_fields(payload.documentType, text)  # type: ignore[arg-type]
    # Only the whitelisted fields ever leave this function — `text` (raw
    # OCR output) and the source image are never persisted or returned.
    return {"ok": True, "fields": fields}


# ---------------- login ----------------
@router.post("/login")
async def login(payload: MerchantLoginIn, db: AsyncSession = Depends(get_db)):
    phone = _normalize_phone(payload.phone)
    await _check_lock(db, phone)

    merchant = await merchant_repo.get_by_phone_light(db, phone)
    if not merchant:
        await _record_failure(db, phone)
        raise HTTPException(401, "Incorrect mobile number, email, or MPIN.")

    # Returning merchants must now confirm the email on file as well as
    # their mobile number. Case/whitespace-insensitive so "Foo@Bar.com"
    # matches "foo@bar.com". Merchants who registered before email was
    # captured (merchant["email"] empty/None) are exempted from this check
    # rather than being permanently locked out -- everyone registering
    # going forward always has an email on file (see Register.tsx).
    on_file_email = (merchant.get("email") or "").strip().lower()
    submitted_email = (payload.email or "").strip().lower()
    if on_file_email and submitted_email != on_file_email:
        await _record_failure(db, phone)
        raise HTTPException(401, "Incorrect mobile number, email, or MPIN.")

    matched, needs_upgrade = verify_mpin_any(phone, payload.mpin, merchant["mpin"])
    if not matched:
        await _record_failure(db, phone)
        raise HTTPException(401, "Incorrect mobile number, email, or MPIN.")

    await _clear_lock(db, phone)

    patch: dict = {"lastLoginAt": plans_ms.now_ms()}
    if needs_upgrade:
        # Password-upgrade pattern: a merchant who registered before the
        # backend owned MPIN verification logs in exactly as before, but
        # their digest is transparently swapped from the legacy salted
        # SHA-256 (src/lib/hash.ts) to a real per-record bcrypt hash.
        patch["mpin"] = hash_mpin(payload.mpin)

    updated = await merchant_repo.update(db, merchant["id"], patch)
    saved = updated or merchant

    if saved.get("status") in ("suspended", "disabled"):
        # Login credentials are correct, but the account is not usable —
        # tell the truth rather than a generic "invalid" (matches the
        # message CustomerFlow.tsx already shows for the QR-scan side).
        raise HTTPException(403, "This account has been suspended. Please contact support.")

    token = create_token(subject=saved["id"], realm="merchant", mpin_hash=saved["mpin"])
    return {"ok": True, "token": token, "merchant": _public_merchant_light(saved)}


# ---------------- self-service profile ----------------
@router.get("/me")
async def me(merchant_id: str = Depends(require_merchant), db: AsyncSession = Depends(get_db)):
    """Light profile query — excludes heavy base64 data URLs (saves ~350KB per request)."""
    m = await merchant_repo.get_by_id_light(db, merchant_id)
    if not m:
        raise HTTPException(404, "Merchant not found.")
    return _public_merchant_light(m)


@router.get("/me/full")
async def me_full(merchant_id: str = Depends(require_merchant), db: AsyncSession = Depends(get_db)):
    """Profile query — prefers lightweight columns while returning all branding URLs."""
    m = await merchant_repo.get_by_id_light(db, merchant_id)
    if not m:
        raise HTTPException(404, "Merchant not found.")
    return _public_merchant_light(m)


@router.patch("/me")
async def update_me(
    payload: MerchantUpdateIn,
    merchant_id: str = Depends(require_merchant),
    db: AsyncSession = Depends(get_db),
):
    patch = {
        k: v for k, v in payload.model_dump(exclude_unset=True).items()
        if k in merchant_repo.MERCHANT_SELF_EDITABLE_FIELDS
    }
    if not patch:
        m = await merchant_repo.get_by_id_light(db, merchant_id)
        if not m:
            raise HTTPException(404, "Merchant not found.")
        return _public_merchant_light(m)

    if patch.get("gstin") and str(patch["gstin"]).strip():
        existing_gstin = await merchant_repo.get_by_gstin(db, str(patch["gstin"]))
        if existing_gstin and existing_gstin["id"] != merchant_id:
            raise HTTPException(409, "This GSTIN is already registered.")

    updated = await merchant_repo.update(db, merchant_id, patch)
    if not updated:
        raise HTTPException(404, "Merchant not found.")
    return _public_merchant_light(updated)


@router.post("/change-mpin")
async def change_mpin(
    payload: MerchantChangeMpinIn,
    merchant_id: str = Depends(require_merchant),
    db: AsyncSession = Depends(get_db),
):
    m = await merchant_repo.get_by_id_light(db, merchant_id)
    if not m:
        raise HTTPException(404, "Merchant not found.")
    matched, _ = verify_mpin_any(m["phone"], payload.oldMpin, m["mpin"])
    if not matched:
        raise HTTPException(401, "Current MPIN is incorrect.")
    await merchant_repo.update(db, merchant_id, {"mpin": hash_mpin(payload.newMpin)})
    return {"ok": True}


# ---------------- forgot MPIN ----------------
# Root cause of "existing merchant has no way to recover their account":
# MerchantLogin.tsx had no "Forgot MPIN?" link at all, and the only
# self-service MPIN change (/change-mpin above) requires the CURRENT MPIN
# and a logged-in session — exactly what a locked-out merchant doesn't
# have. This endpoint is the actual recovery path: identity is proven by a
# fresh OTP check (phone + email, same as registration) via
# POST /send-otp + POST /verify-otp, and `resetToken` is the proof of that
# check (security.create_reset_token, minted only by a successful
# /verify-otp call, valid for 10 minutes, bound to this exact phone
# number). No old MPIN is required or accepted.
@router.post("/reset-mpin")
async def reset_mpin(payload: MerchantResetMpinIn, db: AsyncSession = Depends(get_db)):
    phone = _normalize_phone(payload.phone)
    verify_reset_token(payload.resetToken, phone)

    merchant = await merchant_repo.get_by_phone(db, phone)
    if not merchant:
        raise HTTPException(404, "No account found for this mobile number.")

    # Same email-on-file check as /login, so proving control of the phone
    # (OTP) alone isn't enough if an email is on record.
    on_file_email = (merchant.get("email") or "").strip().lower()
    submitted_email = (payload.email or "").strip().lower()
    if on_file_email and submitted_email != on_file_email:
        raise HTTPException(401, "Mobile number and email do not match our records.")

    if merchant.get("status") in ("suspended", "disabled"):
        raise HTTPException(403, "This account has been suspended. Please contact support.")

    await merchant_repo.update(db, merchant["id"], {"mpin": hash_mpin(payload.newMpin)})
    # A merchant who just proved their identity via OTP shouldn't still be
    # serving out the remainder of an old failed-login lockout window.
    await _clear_lock(db, phone)
    return {"ok": True}


# ---------------- payment verification (closes: paid plan with no payment) ----------------
# See supabase/migrations/0008_payment_orders.sql for the full root-cause
# writeup. Payment capture (create-order -> verify-payment) is now fully
# separate from, and a hard prerequisite for, credit fulfilment
# (purchase-plan / extend-validity below).
VALIDITY_ADDON_PRICE = 50  # kept in sync with src/lib/plans.ts's VALIDITY_ADDON


def _resolve_amount(purpose: str, item_id: str) -> int | None:
    if purpose == "addon":
        return VALIDITY_ADDON_PRICE
    plan = plans_ms.plan_by_id(item_id)
    return plan.price if plan else None


@router.post("/create-order")
async def create_order(
    payload: CreatePaymentOrderIn,
    merchant_id: str = Depends(require_merchant),
    db: AsyncSession = Depends(get_db),
):
    import base64
    import httpx

    amount = _resolve_amount(payload.purpose, payload.itemId)
    if amount is None:
        raise HTTPException(404, "Unknown plan or add-on.")
    now = plans_ms.now_ms()
    local_order_id = f"order_{secrets.token_hex(12)}"
    
    provider_order_id = None
    if settings.razorpay_key_id and settings.razorpay_key_secret and amount > 0:
        auth_str = f"{settings.razorpay_key_id}:{settings.razorpay_key_secret}"
        auth_b64 = base64.b64encode(auth_str.encode("utf-8")).decode("utf-8")
        
        async with httpx.AsyncClient() as client:
            try:
                resp = await client.post(
                    "https://api.razorpay.com/v1/orders",
                    headers={
                        "Authorization": f"Basic {auth_b64}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "amount": int(amount * 100), # in paise
                        "currency": "INR",
                        "receipt": local_order_id
                    },
                    timeout=10.0
                )
                if resp.status_code == 200:
                    rzp_order = resp.json()
                    provider_order_id = rzp_order.get("id")
                else:
                    raise HTTPException(
                        status_code=502,
                        detail=f"Razorpay order creation failed: {resp.text}"
                    )
            except Exception as e:
                if isinstance(e, HTTPException):
                    raise e
                raise HTTPException(
                    status_code=502,
                    detail=f"Failed to communicate with Razorpay: {str(e)}"
                )

    order = await payment_repo.create_order(db, {
        "id": local_order_id,
        "merchantId": merchant_id,
        "purpose": payload.purpose,
        "itemId": payload.itemId,
        "amount": amount,
        "status": "created",
        "consumed": False,
        "createdAt": now,
        "providerOrderId": provider_order_id,
    })
    if amount == 0:
        # Free plan: nothing to pay, nothing to verify — mark paid
        # immediately so /purchase-plan's gate below is satisfied.
        order = await payment_repo.mark_paid(db, order["id"], "free", "n/a", now) or order
    return {
        "ok": True,
        "orderId": order["id"],
        "providerOrderId": order.get("providerOrderId"),
        "amount": amount,
        "keyId": settings.razorpay_key_id or None,
    }


@router.post("/verify-payment")
async def verify_payment(
    payload: VerifyPaymentIn,
    merchant_id: str = Depends(require_merchant),
    db: AsyncSession = Depends(get_db),
):
    order = await payment_repo.get_order(db, payload.orderId)
    if not order or order["merchantId"] != merchant_id:
        raise HTTPException(404, "Order not found.")
    if order["status"] != "created":
        raise HTTPException(409, "Order already processed.")

    if not settings.razorpay_key_secret:
        # No real payment gateway configured yet. Fail closed: a nonzero-
        # amount order can never be marked paid without a real, verifiable
        # signature. (An amount-0 order — the free plan — was already
        # marked paid synchronously in /create-order and never reaches
        # here.) This is deliberate: it is NOT safe to trust a client-
        # supplied "it succeeded" flag, which is exactly the bug being
        # fixed. Configure RAZORPAY_KEY_SECRET to enable real payments.
        raise HTTPException(503, "Payment gateway is not configured yet.")

    # Razorpay's own verification scheme: HMAC-SHA256("order_id|payment_id")
    # using the account's key secret, compared to the signature Razorpay's
    # checkout handler returns to the client. Swap providerOrderId here for
    # whatever field a different gateway's SDK calls its own order id.
    expected = hmac.new(
        settings.razorpay_key_secret.encode("utf-8"),
        f"{order.get('providerOrderId') or order['id']}|{payload.providerPaymentId}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected, payload.signature):
        raise HTTPException(400, "Payment signature verification failed.")

    updated = await payment_repo.mark_paid(db, order["id"], payload.providerPaymentId, payload.signature, plans_ms.now_ms())
    if not updated:
        raise HTTPException(409, "Order already processed.")
    return {"ok": True}


# ---------------- plan purchase / validity / credits ----------------
@router.post("/purchase-plan")
async def purchase_plan(
    payload: PurchasePlanIn,
    merchant_id: str = Depends(require_merchant),
    db: AsyncSession = Depends(get_db),
):
    plan = plans_ms.plan_by_id(payload.planId)
    m = await merchant_repo.get_by_id_light(db, merchant_id)
    if not plan or not m:
        raise HTTPException(404, "Plan or merchant not found.")

    # PAYMENT GATE: any plan with a nonzero price requires a verified,
    # not-yet-consumed order for THIS merchant + THIS plan. This is the
    # actual fix for "merchant can activate a paid plan without successful
    # payment" — see supabase/migrations/0008_payment_orders.sql. The free
    # plan (price 0) is exempt since there is nothing to pay or verify.
    if plan.price > 0:
        if not payload.orderId:
            raise HTTPException(402, "Payment required: no order reference supplied.")
        consumed = await payment_repo.consume_order(db, payload.orderId, merchant_id, "plan", plan.id)
        if not consumed:
            raise HTTPException(402, "Payment not verified for this order.")

    still_active = plans_ms.is_active(m["planExpiresAt"])
    carried = plans_ms.available_credits(m["planExpiresAt"], m["pdfCredits"]) if still_active else 0
    new_credits = carried + plan.credits
    now = plans_ms.now_ms()
    expires_at = now + plan.validity_days * plans_ms.DAY_MS

    updated = await merchant_repo.update(db, merchant_id, {
        "planId": plan.id, "planName": plan.name, "planValidityDays": plan.validity_days,
        "planStartedAt": now, "planExpiresAt": expires_at, "pdfCredits": new_credits,
        "customBranding": plans_ms.plan_unlocks_branding(plan.validity_days),
        "plan": "monthly" if plan.validity_days >= 30 else "recharge",
        "balance": new_credits,
    })
    try:
        await push_service.send_to_merchant(
            db,
            merchant_id,
            title="Plan Activated",
            body=f"Your {plan.name} plan is now active."
        )
    except Exception as push_err:
        logger.error(f"Silent failure sending push notification on plan purchase: {push_err}")
    return {"ok": True, "carried": carried, "merchant": _public_merchant(updated)}


@router.post("/extend-validity")
async def extend_validity(
    payload: ExtendValidityIn,
    merchant_id: str = Depends(require_merchant),
    db: AsyncSession = Depends(get_db),
):
    m = await merchant_repo.get_by_id_light(db, merchant_id)
    if not m:
        raise HTTPException(404, "Merchant not found.")

    # Same payment gate as /purchase-plan — the ₹50 validity add-on is
    # always nonzero-priced, so an orderId is always required here.
    if not payload.orderId:
        raise HTTPException(402, "Payment required: no order reference supplied.")
    consumed = await payment_repo.consume_order(db, payload.orderId, merchant_id, "addon", "addon_validity_50")
    if not consumed:
        raise HTTPException(402, "Payment not verified for this order.")

    base = m["planExpiresAt"] if plans_ms.is_active(m["planExpiresAt"]) else plans_ms.now_ms()
    expires_at = base + plans_ms.VALIDITY_ADDON_DAYS * plans_ms.DAY_MS
    updated = await merchant_repo.update(db, merchant_id, {"planExpiresAt": expires_at})
    try:
        await push_service.send_to_merchant(
            db,
            merchant_id,
            title="Validity Extended",
            body=f"Your plan validity has been extended by {plans_ms.VALIDITY_ADDON_DAYS} days."
        )
    except Exception as push_err:
        logger.error(f"Silent failure sending push notification on validity extension: {push_err}")
    return {"ok": True, "merchant": _public_merchant(updated)}


@router.post("/next-invoice-number")
async def next_invoice_number(
    merchant_id: str = Depends(require_merchant),
    db: AsyncSession = Depends(get_db),
):
    """Issues the next running invoice number for THIS merchant only
    (<merchantCode>-000001, -000002, ...), atomically incrementing their
    own counter — see merchant_repo.next_invoice_number(). This is
    additive: it is separate from, and does not replace, the existing
    GST-format `invoiceNo` (INV/2025-26/0001) any invoice already carries;
    the frontend calls this once per approval purely to attach a second,
    permanent, backend-generated tracking number (Invoice Number) that is
    never generated client-side."""
    result = await merchant_repo.next_invoice_number(db, merchant_id)
    if not result:
        raise HTTPException(404, "Merchant not found.")
    return {"ok": True, **result}


# SECURITY-AUDIT CREDIT-001 (HIGH): /consume-credit and /refund-credit are
# not currently called by any frontend flow (the real invoice-approval
# path deducts credits atomically inside POST /api/merchant/invoices
# server-side — see billing_repo.approve_request_with_invoice), but both
# endpoints were still live and reachable. refund-credit in particular
# accepted an arbitrary `count` with nothing tying it to a real prior
# deduction, letting any authenticated merchant self-generate unlimited
# free PDF credits.
#
# Fix: consume-credit now issues a short-lived (1 hour), single-use
# "consumption receipt" via rate_limit_repo's generic key/value store
# (the same primitive already used for OTP/lockout/rate-limit state —
# no new table needed for what is, in effect, a small ledger). A refund
# must reference that exact receipt id and the same count, and the
# receipt is deleted the moment it's redeemed — so at most one refund per
# consumption, ever, and never more credits than were actually deducted.
def _credit_receipt_key(merchant_id: str, consumption_id: str) -> str:
    return f"credit_consumption:{merchant_id}:{consumption_id}"


@router.post("/consume-credit")
async def consume_credit(
    payload: ConsumeCreditIn,
    merchant_id: str = Depends(require_merchant),
    db: AsyncSession = Depends(get_db),
):
    """Atomic credit deduction. This is the authoritative gate — it cannot
    be bypassed by editing the merchant's own localStorage cache the way
    the old client-only credit check could be. Returns a `consumptionId`
    receipt that /refund-credit must reference to reverse this exact
    deduction (see the CREDIT-001 fix note above)."""
    updated = await merchant_repo.consume_credit(db, merchant_id, payload.count)
    if not updated:
        raise HTTPException(402, "Not enough PDF credits.")

    consumption_id = secrets.token_urlsafe(16)
    await rate_limit_repo.put(
        db,
        _credit_receipt_key(merchant_id, consumption_id),
        {"count": payload.count},
        purge_after=time.time() + 3600,  # 1 hour to claim a refund
    )
    return {"ok": True, "merchant": _public_merchant(updated), "consumptionId": consumption_id}


@router.post("/refund-credit")
async def refund_credit(
    payload: RefundCreditIn,
    merchant_id: str = Depends(require_merchant),
    db: AsyncSession = Depends(get_db),
):
    """Compensating action for /consume-credit: credits back PDF credits
    that were deducted for an invoice which then failed to be created
    (e.g. the browser lost connectivity between the /consume-credit call
    and the /invoices call). Requires `consumptionId` to reference a real,
    not-yet-refunded receipt for THIS merchant with a matching `count` —
    see the CREDIT-001 fix note above. This is intentionally NOT a
    general-purpose credit top-up endpoint."""
    receipt_key = _credit_receipt_key(merchant_id, payload.consumptionId)
    receipt = await rate_limit_repo.get(db, receipt_key)
    if not receipt or receipt.get("count") != payload.count:
        raise HTTPException(404, "No matching credit consumption found to refund.")

    # Single-use: delete the receipt before crediting back, so this exact
    # consumption can never be refunded twice even under a race.
    await rate_limit_repo.delete(db, receipt_key)

    updated = await merchant_repo.refund_credit(db, merchant_id, payload.count)
    if not updated:
        raise HTTPException(404, "Merchant not found.")
    return {"ok": True, "merchant": _public_merchant(updated)}


# ---------------- support tickets ----------------
@router.post("/tickets")
async def create_ticket(
    payload: TicketCreateIn,
    merchant_id: str = Depends(require_merchant),
    db: AsyncSession = Depends(get_db),
):
    ticket_row = {
        "id": f"t_{secrets.token_hex(10)}",
        "merchantId": merchant_id,
        "subject": payload.subject,
        "message": payload.message,
        "reply": None,
        "status": "open",
        "createdAt": int(time.time() * 1000)
    }
    saved = await support_ticket_repo.insert_ticket(db, ticket_row)
    return {"ok": True, "ticket": saved}


@router.get("/tickets")
async def list_tickets(
    merchant_id: str = Depends(require_merchant),
    db: AsyncSession = Depends(get_db),
):
    tickets = await support_ticket_repo.list_by_merchant(db, merchant_id)
    return {"ok": True, "tickets": tickets}


# ---------------- HSN learning ----------------
# Phase 1 of the HSN Learning Engine: moves the learned-memory layer from
# localStorage into the database so it persists across devices/browsers.
# These endpoints are consumed only by this project's own frontend.

@router.post("/hsn-learning/record")
async def record_hsn_learning(
    payload: HsnLearningRecordIn,
    merchant_id: str = Depends(require_merchant),
    db: AsyncSession = Depends(get_db),
):
    """Record merchant-approved HSN selections from a successfully
    generated invoice. Called fire-and-forget by the frontend right after
    the existing learnFromInvoice() localStorage write."""
    await hsn_learning_repo.record_approved_selection(
        db,
        merchant_id,
        [item.model_dump() for item in payload.items],
    )
    return {"ok": True}


@router.get("/hsn-learning")
async def get_hsn_learning(
    merchant_id: str = Depends(require_merchant),
    db: AsyncSession = Depends(get_db),
):
    """Return all learned HSN signals for this merchant so the frontend
    can hydrate its in-memory LearnMap from the server."""
    signals = await hsn_learning_repo.get_learned_signals(db, merchant_id)
    return {"ok": True, "signals": signals}


# ---------------- Merchant Product Intelligence ----------------

@router.get("/product-intelligence", response_model=ProductIntelligenceResponse)
async def get_merchant_product_intelligence(
    merchant_id: str = Depends(require_merchant),
    db: AsyncSession = Depends(get_db),
):
    """Return Merchant Product Intelligence aggregated directly from the canonical
    invoice history."""
    raw_products = await billing_repo.get_product_intelligence(db, merchant_id)
    
    frequent_products = []
    rare_products = []
    
    for p in raw_products:
        # Simple confidence score: caps at 1.0. 
        # A product sold 5 or more times is considered highly confident (1.0).
        p["confidence_score"] = min(p["frequency"] / 5.0, 1.0)
        
        # Categorize products simply by frequency
        if p["frequency"] >= 2:
            frequent_products.append(p)
        else:
            rare_products.append(p)
            
    return {
        "ok": True,
        "frequent_products": frequent_products,
        "rare_products": rare_products
    }


# ---------------- Merchant Behaviour Intelligence ----------------

@router.get("/behaviour-intelligence", response_model=MerchantBehaviourResponse)
async def get_merchant_behaviour_intelligence(
    merchant_id: str = Depends(require_merchant),
    db: AsyncSession = Depends(get_db),
):
    """Return Merchant Behaviour Intelligence metrics derived entirely from the 
    canonical billing and invoice history."""
    
    metrics = await billing_repo.get_merchant_behaviour(db, merchant_id)
    
    return {
        "ok": True,
        **metrics
    }


# ---------------- Merchant Relationship Intelligence ----------------

@router.get("/relationship-intelligence", response_model=MerchantRelationshipResponse)
async def get_merchant_relationship_intelligence(
    merchant_id: str = Depends(require_merchant),
    db: AsyncSession = Depends(get_db),
):
    """Return Merchant Relationship Intelligence (Phase 7) derived automatically from
    the canonical invoice history, linking buyers and suppliers."""
    
    relationships = await billing_repo.get_merchant_relationships(db, merchant_id)
    
    return {
        "ok": True,
        **relationships
    }


# ---------------- Storage Branding Upload Gateway ----------------

@router.post("/upload-branding")
async def upload_branding(
    payload: BrandingUploadIn,
    merchant_id: str = Depends(require_merchant),
    db: AsyncSession = Depends(get_db),
):
    """Upload logo, signature, or company seal to Supabase Storage."""
    if payload.assetType not in ("logo", "signature", "companySeal"):
        raise HTTPException(400, "Invalid asset type.")

    try:
        header, encoded = payload.dataUrl.split(",", 1) if "," in payload.dataUrl else ("", payload.dataUrl)
        file_bytes = base64.b64decode(encoded)
    except Exception:
        raise HTTPException(400, "Invalid base64 image data.")

    compressed_bytes = storage_service.compress_image_to_webp(file_bytes)
    rand_token = secrets.token_hex(6)

    if payload.assetType == "logo":
        bucket = storage_service.PUBLIC_BRANDING_BUCKET
        path = f"{merchant_id}/logo_{rand_token}.webp"
        url_col = "logoUrl"
        flag_col = "hasCustomLogo"
        data_col = "logoDataUrl"
    elif payload.assetType == "signature":
        bucket = storage_service.PRIVATE_SIGNATURES_BUCKET
        path = f"{merchant_id}/sig_{rand_token}.webp"
        url_col = "signatureUrl"
        flag_col = "hasSignature"
        data_col = "signatureDataUrl"
    else:
        bucket = storage_service.PRIVATE_SIGNATURES_BUCKET
        path = f"{merchant_id}/seal_{rand_token}.webp"
        url_col = "companySealUrl"
        flag_col = "hasCompanySeal"
        data_col = "companySealDataUrl"

    uploaded_url = await storage_service.upload_asset(bucket, path, compressed_bytes, "image/webp")

    patch = {
        url_col: uploaded_url or payload.dataUrl,
        flag_col: True,
    }
    # If storage upload succeeded, clear legacy Base64 data column.
    # Only if storage failed entirely do we retain payload.dataUrl as temporary fallback.
    if uploaded_url:
        patch[data_col] = None
    else:
        patch[data_col] = payload.dataUrl

    updated = await merchant_repo.update(db, merchant_id, patch)
    return {"ok": True, "assetUrl": uploaded_url or payload.dataUrl, "merchant": _public_merchant_light(updated or {})}


# ---------------- Merchant Website Builder feature flag ----------------
@router.get("/website-feature-flag")
async def get_website_feature_flag(
    _merchant_id: str = Depends(require_merchant),
    db: AsyncSession = Depends(get_db),
):
    """Checks if the Website Builder feature is enabled globally by administrator."""
    from .. import feature_flags_repo
    enabled = await feature_flags_repo.is_enabled(db, "merchant_website_enabled")
    return {"merchant_website_enabled": True}


# ---------------- AKAI Audit feature flag ----------------
@router.get("/akai-audit/feature-flag")
async def get_akai_audit_flag_merchant_router(
    merchant_id: str = Depends(require_merchant),
    db: AsyncSession = Depends(get_db),
):
    """Checks if AKAI Business Controller / Live Audit is enabled for this merchant."""
    from .. import feature_flags_repo
    enabled = await feature_flags_repo.is_enabled(db, "akai_audit_enabled", merchant_id=merchant_id)
    return {
        "ok": True,
        "akai_audit_enabled": enabled,
        "enabled": enabled,
    }

