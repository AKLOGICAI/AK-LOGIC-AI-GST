import logging
import time

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from . import rate_limit_repo, security, support_ticket_repo, push_repo, customer_repo, chat_repo
from .config import settings
from .database import SessionLocal, get_db
from . import services as otp_services
from .routers import admin, billing, merchant, push, merchant_network, inventory, customer, chat, website, accounting, ondc, delivery

logger = logging.getLogger("otp")

_is_prod_env = settings.environment.lower() == "production"

app = FastAPI(
    title="AK-LOGIC AI — GST Invoice API",
    version="1.0.0",
    # FastAPI publishes interactive Swagger/ReDoc UIs and the raw OpenAPI
    # schema at these paths by default, exposing the full API surface
    # (including every admin/merchant route) to anyone. Disabled in
    # production; still available in development for local debugging.
    docs_url=None if _is_prod_env else "/api-docs",
    redoc_url=None if _is_prod_env else "/api-redoc",
    openapi_url=None if _is_prod_env else "/openapi.json",
)

# ---------------- CORS ----------------
_is_production = settings.environment.lower() == "production"

_default_origins = [
    "https://gst-eight-nu.vercel.app",
    "https://www.ak-logicai.in",
    "https://ak-logicai.in",
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
]

_custom_origins = (
    [o.strip() for o in settings.frontend_origin.split(",") if o.strip()]
    if settings.frontend_origin
    else []
)

_cors_origins = list(set(_default_origins + _custom_origins))
if "*" in _custom_origins or not _is_production:
    _cors_origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins if "*" in _cors_origins else _cors_origins,
    allow_origin_regex=r"https://.*\.vercel\.app|https://.*\.ak-logicai\.in|http://localhost:.*|http://127\.0\.0\.1:.*" if "*" not in _cors_origins else None,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


from . import rate_limit_repo, security, support_ticket_repo, push_repo, customer_repo, chat_repo, feature_flags_repo, inventory_repo, purchase_repo, website_repo, accounting_repo, delivery_repo, sync_repo

@app.on_event("startup")
async def _ensure_tables() -> None:
    """Creates Postgres tables if they don't already exist and starts workers."""
    async with SessionLocal() as session:
        await rate_limit_repo.ensure_schema(session)
        await support_ticket_repo.ensure_schema(session)
        await push_repo.ensure_schema(session)
        await customer_repo.ensure_schema(session)
        await chat_repo.ensure_schema(session)
        await feature_flags_repo.ensure_schema(session)
        await inventory_repo.ensure_schema(session)
        await website_repo.ensure_schema(session)
        await purchase_repo.ensure_schema(session)
        await accounting_repo.ensure_schema(session)
        await delivery_repo.ensure_schema(session)
        await sync_repo.ensure_schema(session)
        
    # Start Phase 6 background jobs worker if the table exists (graceful degradation)
    from sqlalchemy import text
    try:
        async with SessionLocal() as session:
            await session.execute(text("SELECT 1 FROM public.background_jobs LIMIT 1"))
        import asyncio
        from . import jobs_worker
        asyncio.create_task(jobs_worker.worker_loop("main_worker_1"))
    except Exception as e:
        logger.warning(f"Background jobs table not found or error occurred, skipping worker startup: {e}")

# ---------------- OTP ----------------
#
# Root cause of "OTP SMS is not being delivered": the endpoints below used
# to accept/return a single hardcoded FIXED_OTP = "123456" for every phone
# number and never called the real sender in services.py at all — so no
# SMS/WhatsApp message was ever sent regardless of environment.
#
# Now:
#  - Production Mode (MSG91_AUTH_KEY / MSG91_TEMPLATE_ID both set): a real
#    random per-phone OTP is generated and sent via the MSG91 official OTP
#    API. The code is never included in the API response, and is never
#    written to logs (see services.log_otp_event / _mask_phone) — only a
#    structured event with a masked phone number and the MSG91 request id
#    is logged.
#  - Development Mode (MSG91 not configured, i.e. local/dev by default):
#    a real random per-phone OTP is still generated (not a fixed value)
#    and returned in the response ONLY in this mode so local development /
#    preview environments stay usable without an MSG91 account. This is
#    gated on ENVIRONMENT != "production" AND MSG91 being unconfigured — a
#    production deployment can never leak the code this way. A structured
#    otp_dev_mode_fallback log event is emitted (without the code itself).
class OTPRequest(BaseModel):
    phone: str = Field(..., max_length=20)
    # Required on /send-otp so the SAME code can also go out over email
    # (the SMS/MSG91 channel has been unreliable) -- not needed on
    # /verify-otp since the OTP record is still looked up by phone only,
    # so it's optional here and simply ignored by verify_otp below.
    email: str = Field("", max_length=254)
    otp: str = Field("", max_length=6)   # optional for /send-otp

    @field_validator("phone")
    @classmethod
    def _validate_phone(cls, v: str) -> str:
        import re
        if not re.match(r"^\+?[0-9]{10,15}$", v):
            raise ValueError("Enter a valid mobile number (10-15 digits).")
        return v

    @field_validator("email")
    @classmethod
    def _validate_email(cls, v: str) -> str:
        import re
        if v and not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", v):
            raise ValueError("Enter a valid email address.")
        return v

    @field_validator("otp")
    @classmethod
    def _validate_otp(cls, v: str) -> str:
        import re
        if v and not re.match(r"^\d{6}$", v):
            raise ValueError("OTP must be 6 digits.")
        return v

OTP_TTL_SECONDS = 5 * 60
OTP_MAX_ATTEMPTS = 5
OTP_RESEND_COOLDOWN_SECONDS = 60
OTP_LOCKOUT_SECONDS = 15 * 60

# OTP records used to live in an in-memory `otp_store: Dict[str, OtpRecord]`
# — broken the moment there's more than one worker/instance, since each
# one has its own dict (an OTP issued by worker A would be invisible to
# worker B's /verify-otp). Storage now lives in Postgres via
# rate_limit_repo.py (see that module's docstring for the full
# multi-worker-safety design), shared by every worker/instance the same
# way `public.merchants` already is.


def _normalize_phone(phone: str) -> str:
    return phone if phone.startswith("+") else f"+91{phone}"


# ---------------- per-IP rate limiting ----------------
#
# SECURITY GAP CLOSED: the phone-based cooldown/lockout above only protects
# a single phone number. It did nothing to stop one attacker from hitting
# /send-otp for thousands of *different* numbers (SMS/WhatsApp-bombing
# cost abuse + unbounded growth of otp_store between sweeps — a memory
# exhaustion DoS), or from scripting /verify-otp across many numbers at
# once to brute-force several targets in parallel. This adds a simple
# in-memory sliding-window limit per client IP, independent of the
# per-phone limits above, which are unchanged.
IP_SEND_MAX_REQUESTS = 10
IP_SEND_WINDOW_SECONDS = 15 * 60
IP_VERIFY_MAX_REQUESTS = 30
IP_VERIFY_WINDOW_SECONDS = 15 * 60

# Per-IP hit counters used to live in in-memory `_send_ip_hits` /
# `_verify_ip_hits: Dict[str, IpWindow]` dicts — same multi-worker gap as
# otp_store above (each worker had its own counters, so the limit was
# effectively max_requests-per-worker, not max_requests-per-deployment).
# Now backed by rate_limit_repo.check_and_increment_window(), which is
# shared cluster-wide via Postgres.


def _client_ip(request: Request) -> str:
    # Trust X-Forwarded-For's first hop when present (Vercel/Render/most
    # PaaS put the real client IP there); fall back to the raw socket peer
    # for local/dev where there's no proxy in front of the app.
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _is_dev_mode() -> bool:
    return (
        settings.environment.lower() != "production"
        and not otp_services.is_msg91_configured()
        and not otp_services.is_smtp_configured()
    )


@app.post("/send-otp")
async def handle_otp_request(request: OTPRequest, http_request: Request, db: AsyncSession = Depends(get_db)):
    now = time.time()
    client_ip = _client_ip(http_request)
    if await rate_limit_repo.check_and_increment_window(
        db, f"ip_window:send-otp:{client_ip}", IP_SEND_MAX_REQUESTS, IP_SEND_WINDOW_SECONDS,
    ):
        logger.warning("[RATE LIMIT] /send-otp blocked for ip=%s", client_ip)
        return {"ok": False, "message": "Too many requests from this network. Please try again later."}

    # Email is required here (not just phone) so the SAME OTP can also be
    # delivered over email -- see the class docstring above and
    # otp_services.send_email_otp. The SMS/MSG91 channel is best-effort
    # (sent only "if available", per spec); email is now the dependable
    # channel since MSG91 delivery has been unreliable in practice.
    if not request.email and not otp_services.is_msg91_configured() and not _is_dev_mode():
        return {"ok": False, "message": "Email address is required to send a verification code."}

    phone_number = _normalize_phone(request.phone)
    prep = await rate_limit_repo.otp_prepare_send(
        db, phone_number, now, OTP_TTL_SECONDS, OTP_RESEND_COOLDOWN_SECONDS, OTP_LOCKOUT_SECONDS,
    )

    # Lockout window after too many failed /verify-otp attempts.
    if prep["status"] == "locked":
        wait_min = int((prep["locked_until"] - now) // 60) + 1
        return {
            "ok": False,
            "message": f"Too many attempts. Please try again in {wait_min} minute(s).",
        }

    # 60s resend cooldown — also closes the missing client-side guard on
    # Register.tsx's "Resend code" button, which previously had none.
    if prep["status"] == "cooldown":
        wait = int(prep["retry_after"] - now)
        return {
            "ok": False,
            "message": f"Please wait {wait}s before requesting another code.",
        }

    code = prep["code"]

    # Email is now the dependable channel (spec: send the SAME OTP to
    # Email), sent unconditionally when SMTP is configured. SMS remains
    # best-effort (spec: "If SMS service is available, send the SAME OTP
    # to Mobile") -- the user still enters just one OTP regardless of
    # which channel(s) it arrived on.
    smtp_configured = otp_services.is_smtp_configured()
    msg91_configured = otp_services.is_msg91_configured()

    email_sent = False
    if request.email and smtp_configured:
        email_result = await otp_services.send_email_otp(request.email, code)
        email_sent = bool(email_result.get("ok"))

    sms_sent = False
    if msg91_configured:
        sms_result = await otp_services.send_msg91_otp(phone_number, code)
        sms_sent = bool(sms_result.get("ok"))

    if email_sent and sms_sent:
        return {"ok": True, "message": "A verification code has been sent to your email and mobile number.", "mode": "email+msg91"}
    if email_sent:
        return {"ok": True, "message": "A verification code has been sent to your email address.", "mode": "email"}
    if sms_sent:
        return {"ok": True, "message": "A verification code has been sent to your mobile number.", "mode": "msg91"}

    # Neither channel actually delivered the code. Two distinct cases:
    if smtp_configured or msg91_configured:
        # At least one provider IS configured but failed to send (bad
        # credentials, provider outage, etc.) — fail with a real error
        # rather than silently falling back to Development Mode, which
        # would otherwise mask a genuine delivery failure in production.
        otp_services.log_otp_event("otp_provider_error", phone_number, reason="all_configured_providers_failed")
        return {
            "ok": False,
            "message": "Could not send the verification code. Please try again in a moment.",
        }

    # Neither provider is configured at all.
    # Development Mode: never reachable in production (see _is_dev_mode) --
    # the code is still random per-request, never fixed.
    if _is_dev_mode():
        otp_services.log_otp_event("otp_dev_mode_fallback", phone_number, reason="no_provider_configured")
        return {
            "ok": True,
            "message": "Development mode: no email/SMS gateway connected. Code shown below.",
            "otp": code,
            "mode": "development",
        }
    # Defensive fallback: nothing configured but ENVIRONMENT=production --
    # fail closed rather than silently pretending success.
    otp_services.log_otp_event("otp_provider_error", phone_number, reason="no_provider_configured", environment=settings.environment)
    return {
        "ok": False,
        "message": "Verification code delivery is not configured. Please contact support.",
        "mode": "unconfigured",
    }


@app.post("/verify-otp")
async def verify_otp(request: OTPRequest, http_request: Request, db: AsyncSession = Depends(get_db)):
    now = time.time()
    client_ip = _client_ip(http_request)
    if await rate_limit_repo.check_and_increment_window(
        db, f"ip_window:verify-otp:{client_ip}", IP_VERIFY_MAX_REQUESTS, IP_VERIFY_WINDOW_SECONDS,
    ):
        logger.warning("[RATE LIMIT] /verify-otp blocked for ip=%s", client_ip)
        return {"ok": False, "message": "Too many requests from this network. Please try again later."}

    phone_number = _normalize_phone(request.phone)
    result = await rate_limit_repo.otp_verify(
        db, phone_number, request.otp, now, OTP_MAX_ATTEMPTS, OTP_LOCKOUT_SECONDS,
    )

    if result["status"] == "missing":
        return {"ok": False, "message": "No verification code was requested for this number."}
    # Lockout window: previously the record was simply deleted after 5 bad
    # attempts, letting an attacker immediately request a fresh OTP and keep
    # brute-forcing indefinitely. Now the phone number is locked for 15
    # minutes instead — /send-otp also honors this window (see above).
    if result["status"] == "locked":
        wait_min = int((result["locked_until"] - now) // 60) + 1
        return {"ok": False, "message": f"Too many incorrect attempts. Try again in {wait_min} minute(s)."}
    if result["status"] == "expired":
        return {"ok": False, "message": "This code has expired. Please request a new one."}
    if result["status"] == "locked_now":
        return {"ok": False, "message": "Too many incorrect attempts. Try again in 15 minutes."}
    if result["status"] == "invalid":
        return {"ok": False, "message": "Invalid code. Please try again."}

    otp_services.log_otp_event("otp_verify_success", phone_number)
    reset_token = security.create_reset_token(phone_number)
    return {"ok": True, "message": "OTP verified successfully.", "resetToken": reset_token}

# ---------------- Routers ----------------
# public.router (billing_requests/invoices) was removed — nothing in the
# live frontend called it; those tables are still written directly to
# Supabase (see supabase/migrations/0004). merchant.router is back: it now
# speaks the SAME camelCase Supabase schema (via merchant_repo.py) instead
# of the disconnected snake_case one the old version used — see
# backend/app/models.py and routers/merchant.py for the full history.
from .routers import admin, billing, merchant, push, merchant_network, inventory, customer, chat, website, purchases, s2s_admin, accounting, delivery, ondc, akai, sync

app.include_router(admin.router, prefix="/api/admin")
app.include_router(s2s_admin.router, prefix="/api/s2s/admin")
app.include_router(merchant.router, prefix="/api/merchant")
app.include_router(merchant_network.router, prefix="/api/merchant/merchant-network")
app.include_router(billing.public_router, prefix="/api/public")
app.include_router(billing.merchant_router, prefix="/api/merchant")
app.include_router(billing.admin_router, prefix="/api/admin")
app.include_router(push.public_router, prefix="/api/public")
app.include_router(push.merchant_router, prefix="/api/merchant")
app.include_router(inventory.router, prefix="/api/merchant")
app.include_router(purchases.router, prefix="/api/merchant")
app.include_router(customer.router, prefix="/api/customer")
app.include_router(chat.router, prefix="/api")
app.include_router(website.router, prefix="/api")
app.include_router(accounting.router, prefix="/api")
app.include_router(delivery.router, prefix="/api")
app.include_router(ondc.router, prefix="/api")
app.include_router(akai.router, prefix="/api")
app.include_router(sync.router, prefix="/api")

# ---------------- Payments Webhook ----------------
@app.post("/api/public/payments/webhook")
async def razorpay_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    from fastapi import HTTPException
    from sqlalchemy import text
    import hmac
    import hashlib
    import json
    import secrets
    from . import payment_repo

    body = await request.body()
    signature = request.headers.get("X-Razorpay-Signature")
    if not signature:
        raise HTTPException(400, "Missing signature header.")

    if not settings.razorpay_webhook_secret:
        logger.warning("Razorpay webhook received but RAZORPAY_WEBHOOK_SECRET is not configured.")
        raise HTTPException(503, "Payment webhook is not configured.")

    expected = hmac.new(
        settings.razorpay_webhook_secret.encode("utf-8"),
        body,
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise HTTPException(400, "Webhook signature verification failed.")

    try:
        event = json.loads(body.decode("utf-8"))
    except Exception:
        raise HTTPException(400, "Invalid JSON body.")

    event_type = event.get("event")
    if event_type in ("payment.captured", "order.paid"):
        payload = event.get("payload", {})
        provider_payment_id = None
        provider_order_id = None

        # Try to parse payment entity
        payment_entity = payload.get("payment", {}).get("entity", {})
        if payment_entity:
            provider_payment_id = payment_entity.get("id")
            provider_order_id = payment_entity.get("order_id")

        # Try to parse order entity
        if not provider_order_id:
            order_entity = payload.get("order", {}).get("entity", {})
            if order_entity:
                provider_order_id = order_entity.get("id")

        if provider_order_id:
            if not provider_payment_id:
                provider_payment_id = f"pay_webhook_{secrets.token_hex(6)}"
            res = await db.execute(
                text('select id, status from public.payment_orders where "providerOrderId" = :pid'),
                {"pid": provider_order_id}
            )
            row = res.first()
            if row:
                order_id, status = row
                if status == "created":
                    await payment_repo.mark_paid(
                        db, order_id, provider_payment_id, signature or "webhook_signature", int(time.time() * 1000)
                    )
                    logger.info(f"Webhook marked order {order_id} (provider_order_id={provider_order_id}) as paid.")
    return {"status": "ok"}


# ---------------- Root & Health ----------------
@app.get("/")
async def root():
    return {
        "status": "ok"
    }


@app.get("/version")
async def version():
    return {
        "status": "ok"
    }


# ---------------- Razorpay Health Check (Admin Protected) ----------------
@app.get("/api/admin/razorpay-status")
async def razorpay_status(_admin: str = Depends(security.require_admin)):
    key_id = settings.razorpay_key_id
    key_secret = settings.razorpay_key_secret
    webhook_secret = settings.razorpay_webhook_secret
    
    key_mode = "unknown"
    if key_id:
        if key_id.startswith("rzp_live_"):
            key_mode = "live"
        elif key_id.startswith("rzp_test_"):
            key_mode = "test"
            
    return {
        "key_id_configured": bool(key_id),
        "key_id_mode": key_mode,
        "key_secret_configured": bool(key_secret),
        "webhook_secret_configured": bool(webhook_secret),
        "environment": settings.environment
    }
