"""Pydantic v2 schemas (API contracts).

HISTORY: the merchant/billing/invoice schemas that used to live here
(MerchantCreate, MerchantOut, BillingRequestCreate, ApproveRequest,
RejectRequest, InvoiceOut, RechargeIn, PlanPurchase, LogoUpload,
SignatureUpdate, TicketCreate, BroadcastIn, InvoiceItem) were removed
together with backend/app/models.py because they pointed at a disconnected
snake_case schema. See the docstring in models.py for the full audit
finding.

This file now defines the schemas for the REAL merchant/admin-merchant
routes (backend/app/routers/merchant.py, backend/app/routers/admin.py),
which speak the SAME camelCase Supabase schema the frontend already uses
(src/lib/types.ts's Merchant type) via merchant_repo.py — see
supabase/migrations/0005_merchants_lockdown.sql for why these routes exist
(RLS hardening Phase 2).
"""
import re
from typing import Optional, List, Dict, Any, Union

from pydantic import BaseModel, Field, field_validator

_PHONE_RE = re.compile(r"^\+?[0-9]{10,15}$")
_MPIN_RE = re.compile(r"^\d{4,6}$")
_GSTIN_RE = re.compile(r"^[0-9A-Z]{15}$")
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _validate_phone(v: str) -> str:
    if not _PHONE_RE.match(v):
        raise ValueError("Enter a valid mobile number (10-15 digits).")
    return v


def _validate_email(v: str) -> str:
    if not _EMAIL_RE.match(v):
        raise ValueError("Enter a valid email address.")
    return v


def _validate_mpin(v: str) -> str:
    if not _MPIN_RE.match(v):
        raise ValueError("MPIN must be 4-6 digits.")
    return v


def _blank_to_none(v: str | None) -> str | None:
    if v is None:
        return None
    v = v.strip()
    return v or None


class MerchantRegisterIn(BaseModel):
    shopName: str = Field(..., min_length=1, max_length=200)
    ownerName: str = Field(..., min_length=1, max_length=200)
    legalName: str | None = None
    tradeName: str | None = None
    businessType: str | None = None
    email: str | None = None
    phone: str
    mpin: str
    gstin: str = Field(..., min_length=15, max_length=15)
    pan: str = Field(..., min_length=10, max_length=10)
    address: str = Field(..., min_length=1)
    state: str = Field(..., min_length=1)
    city: str | None = None
    pincode: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    bankName: str = Field(..., min_length=1)
    accountType: str | None = None
    accountNumber: str = Field(..., min_length=1)
    ifsc: str = Field(..., min_length=1)
    signatureDataUrl: str | None = None
    upiId: str | None = None
    invoicePrefix: str | None = None

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str) -> str:
        return _validate_phone(v)

    @field_validator("mpin")
    @classmethod
    def _mpin(cls, v: str) -> str:
        return _validate_mpin(v)

    @field_validator(
        "legalName", "tradeName", "businessType", "email", "city", "pincode",
        "accountType", "signatureDataUrl", "upiId", "invoicePrefix",
        mode="before",
    )
    @classmethod
    def _optional_blank(cls, v: str | None) -> str | None:
        return _blank_to_none(v)

    @field_validator("gstin")
    @classmethod
    def _gstin(cls, v: str) -> str:
        v = v.upper().strip()
        if not _GSTIN_RE.match(v):
            raise ValueError("Enter a valid 15-character GSTIN.")
        return v


class OcrScanIn(BaseModel):
    """AI Document Autofill scanner — one captured photo, processed once.
    `phone` is the OTP-verified number from the registration flow (Step
    0), used only as the rate-limit key (see rate_limit_repo.py usage in
    routers/merchant.py's /ocr-scan) — no merchant record exists yet at
    this point in registration."""
    documentType: str = Field(..., pattern="^(gst|bank)$")
    imageBase64: str = Field(..., min_length=1)
    phone: str

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str) -> str:
        return _validate_phone(v)


class MerchantLoginIn(BaseModel):
    phone: str
    # Returning merchants now confirm both their mobile number AND the
    # email on file, alongside their MPIN -- see routers/merchant.py's
    # /login for the actual email-match check against the stored record.
    email: str
    mpin: str

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str) -> str:
        return _validate_phone(v)

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        return _validate_email(v)

    @field_validator("mpin")
    @classmethod
    def _mpin(cls, v: str) -> str:
        return _validate_mpin(v)


class MerchantChangeMpinIn(BaseModel):
    oldMpin: str
    newMpin: str

    @field_validator("oldMpin", "newMpin")
    @classmethod
    def _mpin(cls, v: str) -> str:
        return _validate_mpin(v)


class MerchantResetMpinIn(BaseModel):
    """'Forgot MPIN' flow — for a returning merchant who is locked out and
    doesn't know their current MPIN, so change-mpin's oldMpin requirement
    can't be met. Identity is instead proven by a fresh OTP check (phone +
    email), whose success is represented by `resetToken`
    (security.create_reset_token, minted by POST /verify-otp) rather than
    the old MPIN.
    """
    phone: str
    email: str
    resetToken: str
    newMpin: str

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str) -> str:
        return _validate_phone(v)

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        return _validate_email(v)

    @field_validator("newMpin")
    @classmethod
    def _mpin(cls, v: str) -> str:
        return _validate_mpin(v)


class MerchantUpdateIn(BaseModel):
    """All fields optional — only the ones the merchant actually sent are
    applied. Server-side allowlisted against MERCHANT_SELF_EDITABLE_FIELDS
    regardless of what's set here, so adding a field to this schema alone
    does not make it writable."""
    shopName: str | None = None
    ownerName: str | None = None
    legalName: str | None = None
    tradeName: str | None = None
    businessType: str | None = None
    email: str | None = None
    gstin: str | None = None
    pan: str | None = None
    address: str | None = None
    state: str | None = None
    city: str | None = None
    pincode: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    bankName: str | None = None
    accountType: str | None = None
    accountNumber: str | None = None
    ifsc: str | None = None
    signatureDataUrl: str | None = None
    logoDataUrl: str | None = None
    # Additive-only field for the Company Seal feature (UI/PDF enhancement).
    # Mirrors logoDataUrl/signatureDataUrl exactly — an optional image data
    # URL the merchant uploads or a generated seal is saved into. Does not
    # touch any GST/invoice-numbering/approval/payment logic.
    companySealDataUrl: str | None = None
    brandName: str | None = None
    brandColor: str | None = None
    invoicePrefix: str | None = None
    upiId: str | None = None
    networkTermsAccepted: bool | None = None
    networkTermsAcceptedAt: int | None = None
    networkTermsVersion: str | None = None


class PurchasePlanIn(BaseModel):
    planId: str
    # RLS/payment hardening (see supabase/migrations/0008_payment_orders.sql):
    # required for any plan with a nonzero price — must reference a
    # payment_orders row that is status='paid' (verified via
    # /merchant/verify-payment) and not yet consumed. Optional only so the
    # ₹0 free plan (which nothing currently purchases via this endpoint,
    # but which costs nothing to activate) doesn't need a payment step.
    orderId: str | None = None


class ExtendValidityIn(BaseModel):
    orderId: str | None = None


class ConsumeCreditIn(BaseModel):
    count: int = Field(1, ge=1, le=100)
    reason: str = ""


class RefundCreditIn(BaseModel):
    # SECURITY-AUDIT CREDIT-001 (HIGH): this used to accept an arbitrary
    # `count` with nothing tying it to a real prior deduction, letting any
    # authenticated merchant self-generate unlimited free PDF credits by
    # calling this endpoint repeatedly with no backing record at all.
    # `consumptionId` now REQUIRES a matching, not-yet-refunded receipt
    # that was issued by /consume-credit for THIS merchant — see
    # merchant.py's refund_credit() for the ledger check this closes.
    count: int = Field(1, ge=1, le=100)
    reason: str = ""
    consumptionId: str = Field(..., min_length=1)


class AdminMerchantPatchIn(BaseModel):
    patch: dict
    reason: str = Field(..., min_length=1)
    action: str = Field(..., min_length=1)


# ---------------- QR inventory (see qr_inventory_repo.py) ----------------
class QrGenerateIn(BaseModel):
    count: int = Field(500, ge=1, le=5000)


class QrAssignIn(BaseModel):
    merchantId: str = Field(..., min_length=1)


# ---------------- billing requests / invoices (RLS hardening Phase 3) ----------------
# See supabase/migrations/0007_billing_invoices_lockdown.sql and
# routers/billing.py for why these now go through the backend instead of
# the browser talking to Supabase directly with the anon key.

class BillingRequestCreateIn(BaseModel):
    """Submitted by a customer with no login (QR-scan flow). id, status,
    createdAt are always assigned server-side — never trusted from the
    client — so a customer can't spoof another request's id, backdate a
    submission, or self-approve by sending status='approved' here."""
    merchantId: str = Field(..., min_length=1)
    customerName: str = Field(..., min_length=1, max_length=200)
    customerPhone: str = Field("", max_length=20)
    customerEmail: str = Field("", max_length=200)
    customerGstin: str | None = None
    customerPan: str | None = None
    customerAddress: str = Field("", max_length=1000)
    customerState: str | None = None
    paymentMode: str | None = None
    paymentRef: str | None = None
    items: list[dict] = Field(default_factory=list)
    notes: str | None = None
    branded: bool = False


class BillingRequestPatchIn(BaseModel):
    """Merchant self-service edits to their OWN still-pending request.
    Server-side allowlisted against billing_repo.REQUEST_SELF_EDITABLE_FIELDS
    regardless of what's set here."""
    customerName: str | None = None
    customerPhone: str | None = None
    customerEmail: str | None = None
    customerGstin: str | None = None
    customerPan: str | None = None
    customerAddress: str | None = None
    customerState: str | None = None
    paymentMode: str | None = None
    paymentRef: str | None = None
    items: list[dict] | None = None
    notes: str | None = None


class BillingRequestRejectIn(BaseModel):
    reason: str = Field("", max_length=500)


class InvoiceApproveIn(BaseModel):
    """Approve a pending request: create its invoice and flip the request
    to 'approved' atomically (billing_repo.approve_request_with_invoice).
    merchantId is deliberately NOT accepted here — it is always the
    authenticated merchant (require_merchant), never client-supplied."""
    requestId: str = Field(..., min_length=1)
    invoiceNo: str = Field(..., min_length=1)
    invoiceNumber: str | None = None
    customerName: str = Field(..., min_length=1)
    customerPhone: str = Field("", max_length=20)
    customerEmail: str = Field("", max_length=200)
    customerGstin: str | None = None
    customerPan: str | None = None
    customerAddress: str = Field(..., min_length=1)
    customerState: str | None = None
    paymentMode: str | None = None
    paymentRef: str | None = None
    notes: str | None = None
    items: list[dict] = Field(default_factory=list)
    taxableValue: float = 0
    cgst: float = 0
    sgst: float = 0
    igst: float = 0
    totalTax: float = 0
    roundOff: float = 0
    grandTotal: float = 0
    amountInWords: str | None = None
    placeOfSupply: str | None = None
    isInterState: bool = False
    branded: bool = False

    # BUG-031: billing_requests rows created via the public website-store
    # checkout (routers/website.py: place_public_store_order) never used
    # to collect a customer email, so the column could be NULL in
    # Postgres. The frontend's Review Request modal seeds its edit form
    # straight from that row (customerEmail: req.customerEmail), so
    # approving such a request sent `"customerEmail": null` here.
    # customerPhone/customerEmail are plain `str` (not `Optional[str]`) so
    # Pydantic v2 rejected `null` outright — even though a default of ""
    # exists, a default is only used when the key is ABSENT, not when
    # it's explicitly null — causing every website-store order approval
    # to fail with 422 while QR-scan-origin requests (which always carry
    # a real email/phone) were unaffected. This coercion also protects
    # any already-stuck pending request that still has NULL in the
    # database from older rows, without needing a data backfill.
    @field_validator("customerPhone", "customerEmail", mode="before")
    @classmethod
    def _null_to_empty(cls, v: str | None) -> str:
        return v or ""


class CreatePaymentOrderIn(BaseModel):
    purpose: str = Field(..., pattern="^(plan|addon)$")
    itemId: str = Field(..., min_length=1)


class VerifyPaymentIn(BaseModel):
    orderId: str = Field(..., min_length=1)
    providerPaymentId: str = Field(..., min_length=1)
    signature: str = Field(..., min_length=1)


class TicketCreateIn(BaseModel):
    subject: str = Field(..., min_length=1, max_length=200)
    message: str = Field(..., min_length=1, max_length=2000)


class TicketReplyIn(BaseModel):
    reply: str = Field(..., min_length=1, max_length=2000)
    status: str = Field("resolved", pattern="^(open|pending|resolved)$")

# ==========================================
# MODULE A: Merchant Network Schemas
# ==========================================

class MerchantNetworkRequestCreateIn(BaseModel):
    product_name: str = Field(..., min_length=1)
    quantity: float = Field(..., gt=0)
    unit: str = Field(..., min_length=1)
    urgency: str = Field("normal", pattern="^(normal|urgent)$")


class MerchantNetworkRespondIn(BaseModel):
    availability: str = Field(..., pattern="^(available|not_available)$")


class MerchantNetworkAcceptIn(BaseModel):
    responder_merchant_id: str = Field(..., min_length=1)


class MerchantNetworkMessageIn(BaseModel):
    body: str = Field(..., min_length=1)
    image_url: str | None = None


# ==========================================
# HSN Learning Schemas
# ==========================================

class HsnLearningItem(BaseModel):
    description: str = Field(..., min_length=1)
    hsn: str = Field(..., min_length=1)
    gst_rate: float


class HsnLearningRecordIn(BaseModel):
    items: list[HsnLearningItem] = Field(..., min_length=1)


# ==========================================
# Merchant Product Intelligence Schemas
# ==========================================

class ProductIntelligenceItem(BaseModel):
    name: str
    hsn: Optional[str] = None
    gst_rate: Optional[float] = None
    average_rate: float
    total_qty_sold: float
    frequency: int
    last_sold_at: int
    confidence_score: float


class ProductIntelligenceResponse(BaseModel):
    ok: bool = True
    frequent_products: list[ProductIntelligenceItem]
    rare_products: list[ProductIntelligenceItem]


# ==========================================
# Merchant Behaviour Intelligence Schemas
# ==========================================

class MerchantBehaviourResponse(BaseModel):
    ok: bool = True
    
    # Raw Volume/Frequency Metrics
    total_invoices_generated: int
    total_trade_volume: float
    
    # Raw Responsiveness / Reliability Metrics
    approved_requests_count: int
    rejected_requests_count: int
    ignored_requests_count: int
    avg_response_time_ms: Optional[float] = None
    
    # Raw Activity/Recency Metrics
    last_invoice_at: Optional[int] = None
    last_login_at: Optional[int] = None


# ==========================================
# Merchant Relationship Intelligence Schemas
# ==========================================

class RelationshipItem(BaseModel):
    merchant_id: str
    shop_name: str
    total_invoices: int
    total_volume: float
    last_trade_at: Optional[int] = None

class MerchantRelationshipResponse(BaseModel):
    ok: bool = True
    suppliers: list[RelationshipItem]
    customers: list[RelationshipItem]


# ==========================================
# Customer Vault Schemas
# ==========================================

class CustomerRegisterIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    phone: str
    pin: Optional[str] = None
    resetToken: str
    email: Optional[str] = None
    gstin: Optional[str] = None
    billingAddress: Optional[str] = None
    companyName: Optional[str] = None
    state: Optional[str] = None

    @field_validator("phone")
    @classmethod
    def _val_phone(cls, v: str) -> str:
        return _validate_phone(v)

    @field_validator("pin")
    @classmethod
    def _val_pin(cls, v: Optional[str]) -> Optional[str]:
        if not v:
            return None
        return _validate_mpin(v)


class CustomerLoginIn(BaseModel):
    identifier: str = Field(..., min_length=1, max_length=100)  # phone OR AKC-XXXXXXXX
    pin: str

    @field_validator("pin")
    @classmethod
    def _val_pin(cls, v: str) -> str:
        return _validate_mpin(v)


class CustomerResetPinIn(BaseModel):
    phone: str
    resetToken: str
    newPin: str

    @field_validator("phone")
    @classmethod
    def _val_phone(cls, v: str) -> str:
        if "@" in v:
            return _validate_email(v)
        return _validate_phone(v)

    @field_validator("newPin")
    @classmethod
    def _val_pin(cls, v: str) -> str:
        return _validate_mpin(v)


class CustomerSelectIn(BaseModel):
    customerCode: str = Field(..., min_length=1, max_length=50)
    reason: Optional[str] = "invoice_creation"


class CustomerAutofillIn(BaseModel):
    customerCode: str = Field(..., min_length=1, max_length=50)
    pin: str

    @field_validator("pin")
    @classmethod
    def _val_pin(cls, v: str) -> str:
        return _validate_mpin(v)


class BrandingUploadIn(BaseModel):
    assetType: str = Field(..., description="'logo', 'signature', or 'companySeal'")
    dataUrl: str = Field(..., description="Base64 image data URL")
