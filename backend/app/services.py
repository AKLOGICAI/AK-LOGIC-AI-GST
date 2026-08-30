"""Service layer.

Only OTP delivery lives here now. The merchant/billing/invoice business
logic that used to live in this file (create_request, approve_request,
reject_request, purchase_plan, extend_validity, upload_logo,
save_signature, broadcast, record_audit_log) was removed together with
backend/app/models.py's table definitions and
backend/app/routers/{merchant,public}.py — see the docstring at the top
of backend/app/models.py for the full audit finding. None of it was
reachable from the live frontend; it operated on a second, disconnected,
snake_case copy of the merchant schema that is what caused the
accountNumber / account_number naming confusion.
"""
import json
import logging

import httpx

from .config import settings

# ---------------- OTP delivery (MSG91 official OTP API) ----------------
#
# This used to be dead code: main.py's /send-otp and /verify-otp routes
# used a hardcoded FIXED_OTP = "123456" for every phone number and never
# called this function at all, which is the actual root cause of "OTP SMS
# is not being delivered" — no message was ever sent by the live
# endpoints, whichever provider was configured. main.py calls
# send_msg91_otp below whenever MSG91 credentials are configured.
#
# MSG91 is used purely as the SMS *transport* here. OTP generation, TTL,
# resend cooldown, per-phone attempt limits and verification are all still
# handled entirely by this backend (see rate_limit_repo.py), exactly as
# before this change — the same code that /verify-otp checks is the one
# handed to MSG91's Send OTP API via the `otp` parameter below. MSG91's own
# OTP-verify endpoint is intentionally never called, so the verification
# flow, resend cooldown and rate limiting are unaffected by this swap.
#
# All configuration is read from environment variables only (via
# config.Settings) — nothing here is ever hardcoded. See .env.example for
# the full list: MSG91_AUTH_KEY, MSG91_TEMPLATE_ID, MSG91_SENDER_ID,
# MSG91_DLT_ENTITY_ID, MSG91_DLT_TE_ID.
MSG91_OTP_SEND_URL = "https://control.msg91.com/api/v5/otp"
MSG91_REQUEST_TIMEOUT_SECONDS = 10.0

_otp_logger = logging.getLogger("otp")


def _mask_phone(phone_number: str) -> str:
    """Never log a full phone number — only enough of it (last 4 digits)
    to correlate log lines with a support ticket/user report."""
    if not phone_number:
        return ""
    digits = phone_number[-4:]
    return f"***{digits}"


def log_otp_event(event: str, phone_number: str = "", **fields) -> None:
    """Structured (single-line JSON) logging for the OTP lifecycle, so log
    aggregators (CloudWatch/Datadog/etc.) can filter and alert on `event`
    without regex-parsing free-text messages. Used for: otp_send_success,
    otp_send_failed, otp_verify_success, otp_provider_error and
    otp_dev_mode_fallback. OTP codes themselves are never logged."""
    payload = {"event": event}
    if phone_number:
        payload["phone"] = _mask_phone(phone_number)
    payload.update(fields)
    level = logging.ERROR if "error" in event or "failed" in event else logging.INFO
    _otp_logger.log(level, json.dumps(payload, default=str))


def is_msg91_configured() -> bool:
    # `otp_provider_api_key` is accepted as a fallback for `msg91_auth_key`
    # for backward compatibility with any deployment that already set the
    # older, provider-agnostic env var before this migration.
    auth_key = settings.msg91_auth_key or settings.otp_provider_api_key
    return bool(auth_key and settings.msg91_template_id)


# Deprecated alias kept for backward compatibility with any code (scripts,
# notebooks, older imports) still referencing the pre-MSG91 name. Twilio is
# no longer used by this backend; this now reflects MSG91 configuration.
is_twilio_configured = is_msg91_configured


def otp_provider_status() -> dict:
    """Meaningful, structured description of the current OTP provider
    state. Never raises — callers (main.py, health checks) use this to
    decide whether to call send_msg91_otp() or fall back to Development
    Mode, and can surface `message` directly to an operator/log without
    needing to know MSG91-specific internals."""
    if is_msg91_configured():
        return {"configured": True, "mode": "msg91"}
    return {
        "configured": False,
        "mode": "development",
        "message": "MSG91 credentials are not configured.",
    }


def _msg91_auth_key() -> str:
    return settings.msg91_auth_key or settings.otp_provider_api_key


def _msg91_mobile(to_number: str) -> str:
    """MSG91's OTP API expects the mobile number as country-code + digits
    only (e.g. "919876543210"), no leading '+'. Callers here always pass an
    already-normalized "+91XXXXXXXXXX"-style number (see main.py's
    _normalize_phone), so this just strips the leading '+' if present."""
    return to_number[1:] if to_number.startswith("+") else to_number


async def send_msg91_otp(to_number: str, otp_code: str) -> dict:
    """Send an OTP via the MSG91 official OTP API. Caller must check
    is_msg91_configured() first. If credentials are missing this returns a
    meaningful failure dict rather than raising or crashing the process —
    callers are expected to fall back to Development Mode in that case
    (see main.py). This mirrors the previous provider integration's
    contract so callers don't need any further changes."""
    if not is_msg91_configured():
        status = otp_provider_status()
        log_otp_event("otp_dev_mode_fallback", to_number, reason="msg91_not_configured")
        return {"ok": False, "mode": status["mode"], "reason": "msg91_not_configured", "message": status["message"]}

    payload = {
        "template_id": settings.msg91_template_id,
        "mobile": _msg91_mobile(to_number),
        "otp": otp_code,
        "otp_expiry": settings.msg91_otp_expiry_minutes,
    }
    if settings.msg91_sender_id:
        payload["sender"] = settings.msg91_sender_id
    # Optional DLT (TRAI) identifiers. Only sent if configured — most
    # MSG91 accounts have these tied to the template/sender already and
    # never need to pass them per-request, but some enterprise setups
    # require them explicitly on every send.
    if settings.msg91_dlt_entity_id:
        payload["DLT_entity_id"] = settings.msg91_dlt_entity_id
    if settings.msg91_dlt_te_id:
        payload["DLT_TE_ID"] = settings.msg91_dlt_te_id

    headers = {
        "authkey": _msg91_auth_key(),
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=MSG91_REQUEST_TIMEOUT_SECONDS) as client:
            response = await client.post(MSG91_OTP_SEND_URL, json=payload, headers=headers)

        try:
            data = response.json() if response.content else {}
        except ValueError:
            data = {}

        if response.status_code == 200 and str(data.get("type", "")).lower() == "success":
            # MSG91 returns the request id in "message" on success.
            request_id = data.get("message")
            log_otp_event("otp_send_success", to_number, provider="msg91", request_id=request_id)
            return {"ok": True, "mode": "msg91", "request_id": request_id}

        reason = data.get("message") or f"msg91_http_{response.status_code}"
        log_otp_event("otp_provider_error", to_number, provider="msg91", reason=reason, http_status=response.status_code)
        return {"ok": False, "mode": "msg91", "reason": reason}

    except Exception as e:
        # Logged (not printed) so it shows up with proper severity in
        # production log aggregation instead of only local stdout.
        log_otp_event("otp_provider_error", to_number, provider="msg91", reason=str(e))
        return {"ok": False, "mode": "msg91", "reason": str(e)}


# Deprecated alias kept for backward compatibility with any code still
# calling the pre-MSG91 function name. Sends via MSG91, not Twilio/WhatsApp.
send_whatsapp_otp = send_msg91_otp


# ---------------- OTP delivery (Email, via SMTP) ----------------
#
# Added so the SAME one-time code main.py already generates for /send-otp
# is also delivered over email, not just SMS. The SMS channel (MSG91) has
# been unreliable in practice, so email is now a dependable second channel
# for the SAME OTP rather than a future/separate OTP — matches the "one
# OTP, sent to both channels" spec exactly. Nothing about OTP generation,
# TTL, resend cooldown or verification changes here; this only adds a
# delivery transport, mirroring send_msg91_otp's shape/contract.


def _mask_email(email: str) -> str:
    """Never log a full email address — just enough to correlate log
    lines with a support ticket/user report, mirroring _mask_phone."""
    if not email or "@" not in email:
        return ""
    local, _, domain = email.partition("@")
    keep = local[:2]
    return f"{keep}***@{domain}"


BREVO_EMAIL_API_URL = "https://api.brevo.com/v3/smtp/email"
BREVO_REQUEST_TIMEOUT_SECONDS = 15.0
OTP_EMAIL_TTL_MINUTES = 5


def is_smtp_configured() -> bool:
    """Name kept as-is for backward compatibility with existing callers
    (main.py) — it now reports whether the Brevo HTTP API is configured,
    not raw SMTP. Raw SMTP is no longer used at all: Render's free web
    services block outbound traffic to every SMTP port (25/465/587), so
    no SMTP_HOST/PORT/credentials combination can ever succeed there,
    correct or not — every attempt just hangs until timeout. The Brevo
    HTTP API call below goes over plain HTTPS (port 443) instead, which
    is never blocked."""
    return bool(settings.brevo_api_key and (settings.smtp_from_email or settings.smtp_user))


def _smtp_from_address() -> str:
    return settings.smtp_from_email or settings.smtp_user


async def send_email_otp(to_email: str, otp_code: str) -> dict:
    """Send an OTP via Brevo's transactional email HTTP API. Caller must
    check is_smtp_configured() first. Never raises — returns a meaningful
    failure dict instead, same contract as send_msg91_otp."""
    if not is_smtp_configured():
        log_otp_event("otp_email_provider_error", reason="brevo_not_configured")
        return {"ok": False, "mode": "brevo", "reason": "brevo_not_configured"}

    payload = {
        "sender": {"email": _smtp_from_address()},
        "to": [{"email": to_email}],
        "subject": "Your AK-LOGIC AI verification code",
        "textContent": (
            f"Your AK-LOGIC AI verification code is {otp_code}. "
            f"It is valid for {OTP_EMAIL_TTL_MINUTES} minutes. "
            f"Do not share this code with anyone."
        ),
    }
    headers = {
        "api-key": settings.brevo_api_key,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=BREVO_REQUEST_TIMEOUT_SECONDS) as client:
            response = await client.post(BREVO_EMAIL_API_URL, json=payload, headers=headers)

        if response.status_code in (200, 201):
            log_otp_event("otp_email_send_success", email=_mask_email(to_email))
            return {"ok": True, "mode": "brevo"}

        try:
            data = response.json() if response.content else {}
        except ValueError:
            data = {}
        reason = data.get("message") or f"brevo_http_{response.status_code}"
        log_otp_event("otp_email_provider_error", email=_mask_email(to_email), reason=reason, http_status=response.status_code)
        return {"ok": False, "mode": "brevo", "reason": reason}

    except Exception as e:
        log_otp_event("otp_email_provider_error", email=_mask_email(to_email), reason=str(e))
        return {"ok": False, "mode": "brevo", "reason": str(e)}