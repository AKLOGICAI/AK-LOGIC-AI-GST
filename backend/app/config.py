from pydantic_settings import BaseSettings
from pydantic import field_validator

# IMPORTANT: every field below has a default. A missing/incomplete .env must
# NEVER crash the entire backend at import time — that previously took down
# every route (including OTP) any time a single optional variable (e.g.
# PASSPORT_EMAIL) was unset, which independently reproduced the
# "OTP not delivered" symptom by making /send-otp unreachable.
#
# Only the values that are genuinely required for a given FEATURE to work
# (e.g. real MSG91 SMS) are checked at the point of use, not at startup —
# see routers using otp_service.is_msg91_configured().
class Settings(BaseSettings):
    # Core
    #
    # IMPORTANT (RLS hardening Phase 2 — see
    # supabase/migrations/0005_merchants_lockdown.sql): this MUST point at
    # the Supabase project's direct Postgres connection using the
    # `postgres` role (Supabase dashboard -> Project Settings -> Database
    # -> Connection string -> "URI", NOT the pgbouncer/anon/authenticated
    # roles). That role has BYPASSRLS, which is what lets this backend
    # read/write `public.merchants` after the anon-key RLS policies on
    # that table were locked down to deny everything. Using any other
    # role here will make every merchant register/login/update/admin
    # endpoint fail with a permission-denied error once the migration is
    # applied. Format: postgresql+asyncpg://postgres:<password>@<host>:5432/postgres
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost/aklogic"
    jwt_secret: str = "change-me-in-prod"
    jwt_algorithm: str = "HS256"
    access_token_ttl_min: int = 30 * 24 * 60
    recharge_per_invoice: int = 20
    monthly_plan_price: int = 499
    secret_key: str = "your_secret_key_here"
    environment: str = "development"  # "development" | "production"

    # MSG91 (OTP delivery). Leave blank to run in OTP Development Mode.
    # MSG91_AUTH_KEY: MSG91 dashboard -> Settings -> API -> Auth Key.
    # MSG91_TEMPLATE_ID: the approved "Send OTP" template id from the MSG91
    #   OTP widget/template section (DLT-approved SMS template).
    # MSG91_SENDER_ID: optional 6-character DLT-approved sender id; when
    #   blank, MSG91 uses the sender configured on the template itself.
    # MSG91_DLT_ENTITY_ID / MSG91_DLT_TE_ID: optional TRAI/DLT identifiers
    #   (Entity ID and Template/Header ID). Most MSG91 accounts already
    #   have these tied to the template/sender and never need them passed
    #   per-request; only set these if MSG91 support tells you your
    #   account requires them explicitly on every Send OTP call.
    # MSG91_OTP_EXPIRY_MINUTES: expiry MSG91 is told to apply on its side.
    #   This backend's own TTL (OTP_TTL_SECONDS in main.py, backed by
    #   rate_limit_repo.py) remains the source of truth for /verify-otp
    #   regardless of this value — MSG91's built-in OTP-verify endpoint is
    #   never used, only their OTP *send* API.
    msg91_auth_key: str = ""
    msg91_template_id: str = ""
    msg91_sender_id: str = ""
    msg91_dlt_entity_id: str = ""
    msg91_dlt_te_id: str = ""
    msg91_otp_expiry_minutes: int = 5

    # Razorpay (or compatible) payment verification. Leave blank to run
    # with payment verification unavailable — see routers/merchant.py's
    # /verify-payment: with no secret configured, verification fails
    # closed (no order for a nonzero-price plan can ever be marked
    # 'paid'), rather than falling back to trusting the client the way
    # the pre-fix /purchase-plan endpoint did. Set these once a real
    # gateway account exists.
    razorpay_key_id: str = ""
    razorpay_key_secret: str = ""
    razorpay_webhook_secret: str = ""

    # Supabase project URL/anon key — currently unused by the backend
    # itself (kept in case a future admin/reporting task needs them via
    # PostgREST). The backend talks to the SAME database directly via
    # database_url instead (see the comment on that field above); the
    # frontend still uses these two for its own direct Supabase calls
    # (merchants_public QR lookups, billing_requests, invoices) via its
    # own VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — merchant register/
    # login/profile writes go through this backend, not Supabase directly.
    supabase_url: str = ""
    supabase_anon_key: str = ""

    # Misc / optional
    passport_email: str = ""
    admin_email: str = ""
    vite_admin_email: str = ""
    vite_support_email: str = ""
    vite_encryption_key: str = ""
    vite_api_base: str = ""
    # SECURITY: this MUST NOT default to a real, working bcrypt hash. It
    # used to (a copy-pasteable hash also duplicated in .env.example),
    # which meant any deployment that forgot to set this env var was
    # silently protected by a hash anyone with this codebase already had
    # — and the production check below only tested for an *empty* string,
    # so it never caught this. Empty-by-default now fails loudly instead
    # (admin_login below returns 500 "not configured", and the production
    # fail-fast check treats empty the same as before). Generate a real
    # one per deployment: python -c "import bcrypt; print(bcrypt.hashpw(b'yourpassword', bcrypt.gensalt()).decode())"
    admin_password_hash: str = ""
    allow_dev_admin_otp: bool = False
    dev_admin_otp: str = ""
    otp_provider_api_key: str = ""

    # SMTP (Email OTP delivery). Leave smtp_host blank to run without email
    # OTP -- see services.is_smtp_configured(). Added because the MSG91 SMS
    # channel is unreliable in practice ("SMS provider drama kar raha hai"),
    # so email is now sent the SAME OTP as a dependable second channel
    # rather than a "future upgrade" -- see main.py's /send-otp.
    # SMTP_HOST: e.g. smtp.gmail.com / smtp-relay.brevo.com / smtp.zoho.in
    # SMTP_USER / SMTP_PASSWORD: mailbox/API credentials for that host.
    # SMTP_FROM_EMAIL: the "From" address shown to the merchant (falls back
    #   to SMTP_USER when unset, since most providers require From == the
    #   authenticated mailbox anyway).
    smtp_host: str = ""
    smtp_port: str = "587"
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from_email: str = ""

    # Brevo transactional email HTTP API (https://api.brevo.com/v3/smtp/email).
    # Used INSTEAD of raw SMTP for OTP emails, because Render's free web
    # services block outbound traffic on SMTP ports 25/465/587 entirely --
    # no SMTP host/port/credentials combination can work there, regardless
    # of whether they're correct (see services.send_email_otp). This API
    # call goes over plain HTTPS (port 443), which is never blocked.
    # BREVO_API_KEY: Brevo dashboard -> SMTP & API -> API Keys -> Generate.
    # Uses the same Brevo account as the old SMTP_HOST=smtp-relay.brevo.com
    # setup, so SMTP_FROM_EMAIL (the sender identity) is reused as-is.
    brevo_api_key: str = ""

    # Comma-separated list of allowed origins in production, e.g.
    # "https://app.aklogic.ai,https://aklogic.ai". Only enforced (and only
    # required) when environment=production — see the fail-fast check below
    # and main.py's CORS middleware setup.
    frontend_origin: str = ""

    # AES-256-GCM key used by field_crypto.py to encrypt/decrypt sensitive
    # merchant bank columns (bankName, accountNumber, ifsc, upiId) at
    # rest — see field_crypto.py's module docstring for why this exists.
    # Set a strong random secret (32+ characters, e.g. `openssl rand -hex 32`)
    # as FIELD_ENCRYPTION_KEY on the backend. Losing this value after
    # bank details have been encrypted with it means those values can
    # never be decrypted again — store it as carefully as jwt_secret.
    field_encryption_key: str = ""

    @field_validator(
        "razorpay_key_id",
        "razorpay_key_secret",
        "razorpay_webhook_secret",
        "jwt_secret",
        "secret_key",
        "database_url",
        "dev_admin_otp",
        "field_encryption_key",
        mode="before"
    )
    @classmethod
    def _strip_whitespace(cls, v: str) -> str:
        if isinstance(v, str):
            return v.strip()
        return v

    # Web Push VAPID Configuration
    vapid_public_key: str = ""
    vapid_private_key: str = ""
    vapid_subject: str = ""

    # Google Cloud Vision (AI Document Autofill — GST/Bank document scanner
    # during registration, see ocr_service.py). Leave blank to run with the
    # scanner unavailable — /api/merchant/ocr-scan returns 503 and the
    # existing manual-entry registration flow keeps working regardless
    # (same "feature-optional, never blocks registration" pattern as
    # msg91/razorpay above). Get a key from Google Cloud Console -> APIs &
    # Services -> Credentials, with the Cloud Vision API enabled.
    google_vision_api_key: str = ""

    # Shared secret for the read-only server-to-server admin reporting
    # endpoint (routers/s2s_admin.py), called by AK-LOGIC-AI-PLATFORM's
    # backend to pull real revenue/merchant figures. Leave blank to run
    # with that endpoint unavailable (fails closed with 503) — same
    # "feature-optional, never blocks the rest of the app" pattern as
    # msg91/razorpay/google_vision above. Generate with e.g.
    # `openssl rand -hex 32` and set the SAME value as GST_S2S_SECRET on
    # both this service and AK-LOGIC-AI-PLATFORM's backend.
    gst_s2s_secret: str = ""

    class Config:
        env_file = ".env"
        # Case-insensitive so MSG91_AUTH_KEY / msg91_auth_key both work
        case_sensitive = False
        extra = "ignore"

settings = Settings()

# Fail fast in production if required secrets are still at their
# insecure development defaults / unset. This intentionally does NOT run
# in development so local setup keeps working without a .env file, per the
# existing "must never crash the whole backend on a missing optional var"
# design documented above — this check only concerns itself with the
# handful of values that are unsafe to run production with, not every
# optional field.
if settings.environment.lower() == "production":
    _weak_or_missing = {
        "jwt_secret": settings.jwt_secret in ("", "change-me-in-prod"),
        "secret_key": settings.secret_key in ("", "your_secret_key_here"),
        "admin_password_hash": settings.admin_password_hash in ("", "$2b$12$8Q1dg5o7rSX1cye2ubmGIexF5GtXaP4w3TtpwZTAIhuCZACoPPN9y"),
        "frontend_origin": not settings.frontend_origin,
        "razorpay_key_id": not settings.razorpay_key_id or settings.razorpay_key_id.startswith("rzp_test_"),
        "razorpay_key_secret": not settings.razorpay_key_secret,
        "field_encryption_key": len(settings.field_encryption_key) < 16,
    }
    _bad = [k for k, is_bad in _weak_or_missing.items() if is_bad]
    if _bad:
        raise RuntimeError(
            "Refusing to start with ENVIRONMENT=production while these "
            f"settings are missing or using insecure defaults or test keys: {_bad}. "
            "Set real values via environment variables or .env."
        )
