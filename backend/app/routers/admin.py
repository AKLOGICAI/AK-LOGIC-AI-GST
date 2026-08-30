"""Admin realm — completely separate auth + endpoints.

HISTORY: only /login and the dev-only /otp/verify used to be implemented
here, because those were the only admin endpoints the live frontend
called (see src/lib/authClient.ts). The merchant-management, revenue,
audit, fraud, broadcast, tickets, and health endpoints that used to live
in this file queried backend/app/models.py's now-removed snake_case
Merchant / BillingRequest / Invoice / SupportTicket / AdminAuditLog
tables in a database the frontend never wrote to — that was unreachable
dead code. See the docstring in backend/app/models.py for the full audit
finding.

The merchant-management endpoints below are the REAL replacement: they
speak the same camelCase Supabase schema as everything else (via
merchant_repo.py) and are what src/lib/services.ts's `adminService` now
calls, instead of the old behaviour of only ever patching the admin's own
browser's localStorage cache (see merchant.py's router docstring for that
bug) or, before this migration, writing directly to Supabase with the
public anon key (the RLS finding this whole change addresses — see
supabase/migrations/0005_merchants_lockdown.sql).

SECURITY: /login and /otp/verify remain unauthenticated by design (they
*issue* the admin token); every other admin endpoint requires it via
Depends(require_admin).
"""

import logging
import time

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from .. import merchant_repo, plans_ms, qr_inventory_repo, rate_limit_repo, support_ticket_repo, push_service
from ..config import settings
from ..database import get_db
from ..schemas import AdminMerchantPatchIn, MerchantRegisterIn, QrAssignIn, QrGenerateIn, TicketReplyIn
from ..security import create_token, require_admin
from .merchant import create_merchant_record

logger = logging.getLogger("admin")

router = APIRouter(tags=["admin"])

# ---------------- brute-force protection (mirrors merchant.py's login lockout) ----------------
# CLOSES: admin /login previously had no rate limiting, lockout, or
# logging at all — a single exposed endpoint guarding the entire admin
# console, protected by nothing but the password itself. This uses the
# exact same standard already applied to merchant login
# (backend/app/routers/merchant.py's _check_lock/_record_failure/
# _clear_lock): 5 wrong attempts locks that source out for 15 minutes.
# Keyed by client IP (there is no phone/username to key by for a single
# shared admin password) so a distributed attacker still has to burn a
# lockout window per source IP, and every attempt — success or failure —
# is logged with the source IP for audit/incident-response purposes.
#
# Previously an in-memory `_admin_login_locks: Dict[str, _LoginLock]` —
# broken across multiple workers/instances (an IP locked out on worker A
# could keep brute-forcing freely on worker B). Now backed by Postgres via
# rate_limit_repo.py, shared cluster-wide the same way `public.merchants`
# already is.
ADMIN_LOGIN_MAX_ATTEMPTS = 5
ADMIN_LOGIN_LOCKOUT_SECONDS = 15 * 60


def _admin_lock_key(ip: str) -> str:
    return f"login_lock:admin:{ip}"


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


async def _check_admin_lock(db: AsyncSession, ip: str) -> None:
    locked_until = await rate_limit_repo.check_lockout(db, _admin_lock_key(ip))
    if locked_until:
        wait_min = int((locked_until - time.time()) // 60) + 1
        raise HTTPException(429, f"Too many incorrect attempts. Try again in {wait_min} minute(s).")


async def _record_admin_failure(db: AsyncSession, ip: str) -> None:
    locked_until = await rate_limit_repo.record_failed_login(
        db, _admin_lock_key(ip), ADMIN_LOGIN_MAX_ATTEMPTS, ADMIN_LOGIN_LOCKOUT_SECONDS,
    )
    if locked_until:
        logger.warning("admin login LOCKED OUT for %s (%d failed attempts)", ip, ADMIN_LOGIN_MAX_ATTEMPTS)


async def _clear_admin_lock(db: AsyncSession, ip: str) -> None:
    await rate_limit_repo.clear_lockout(db, _admin_lock_key(ip))


class LoginSchema(BaseModel):
    password: str


class OTPVerifyIn(BaseModel):
    otp: str


@router.post("/login")
async def admin_login(payload: LoginSchema, request: Request, db: AsyncSession = Depends(get_db)):
    ip = _client_ip(request)
    await _check_admin_lock(db, ip)
    try:
        if not settings.admin_password_hash:
            raise HTTPException(
                status_code=500,
                detail="Admin password is not configured."
            )

        stored_hash = settings.admin_password_hash.encode("utf-8")
        password = payload.password.encode("utf-8")

        if bcrypt.checkpw(password, stored_hash):
            await _clear_admin_lock(db, ip)
            logger.info("admin login SUCCESS from %s", ip)
            token = create_token(subject="admin", realm="admin")
            return {"ok": True, "token": token}

        await _record_admin_failure(db, ip)
        logger.warning("admin login FAILED from %s", ip)
        raise HTTPException(
            status_code=401,
            detail="Incorrect password."
        )

    except HTTPException:
        raise

    except Exception:
        logger.exception("Admin login failed")
        raise HTTPException(
            status_code=500,
            detail="Admin login failed. Please try again."
        )


@router.post("/otp/verify")
async def admin_otp_verify(payload: OTPVerifyIn, request: Request, db: AsyncSession = Depends(get_db)):
    """Development-only admin OTP verification, gated behind an explicit env var.

    This path is intentionally disabled by default and only becomes available
    when ALLOW_DEV_ADMIN_OTP=true and a non-empty DEV_ADMIN_OTP is configured.
    Production deployments never get this fallback, even if the env var is
    accidentally set in the wrong place."""
    if settings.environment.lower() == "production" or not settings.allow_dev_admin_otp:
        raise HTTPException(403, "Admin OTP demo mode is disabled.")
    if not settings.dev_admin_otp:
        raise HTTPException(403, "Admin OTP demo mode is not configured.")

    ip = _client_ip(request)
    await _check_admin_lock(db, ip)

    logger.warning("[DEV ADMIN OTP] demo OTP verification attempt from %s", ip)

    if payload.otp != settings.dev_admin_otp:
        await _record_admin_failure(db, ip)
        raise HTTPException(401, "Invalid code.")

    await _clear_admin_lock(db, ip)
    token = create_token(subject="admin", realm="admin")
    return {"ok": True, "token": token}



# ---------------- merchant management (RLS hardening Phase 2) ----------------
# Every merchant mutation triggered from the admin console — suspend/
# reactivate, KYC, credit grants, plan changes, branding toggles — now
# goes through here instead of writing directly to Supabase with the anon
# key (which had no real authorization check behind it: any caller with
# the anon key could impersonate an admin action) or, before that fix,
# only touching the admin's own browser's local cache. See merchant.py's
# router docstring for the second bug.

@router.get("/merchants")
async def list_merchants(
    _admin: str = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    rows = await merchant_repo.list_all_light(db)
    return {"merchants": [{k: v for k, v in m.items() if k != "mpin"} for m in rows]}


@router.post("/merchants")
async def create_merchant(
    payload: MerchantRegisterIn,
    admin: str = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Manually onboard a merchant from the admin console — same validation
    and insert path as self-service /api/merchant/register (see
    create_merchant_record in merchant.py), just skipping the OTP step
    that only exists in the merchant-facing UI. This is safe specifically
    *because* the caller already went through require_admin: OTP's job was
    proving phone ownership before a stranger could self-register; here the
    admin is vouching for the merchant instead, exactly like an admin
    resetting a password or manually verifying an offline KYC.

    The MPIN the admin types in IS the merchant's real login MPIN going
    forward — no token is issued to the admin's session, so the admin is
    never silently logged in "as" the merchant. The merchant logs in
    themselves afterwards with their phone + this MPIN via the normal
    /api/merchant/login flow (unchanged, still bcrypt-verified server-side).
    """
    saved = await create_merchant_record(db, payload)
    logger.info(
        "admin action: manually created merchant=%s (phone=%s) by=%s",
        saved["id"], saved.get("phone"), admin,
    )
    return {"ok": True, "merchant": {k: v for k, v in saved.items() if k != "mpin"}}


@router.patch("/merchants/{merchant_id}")
async def patch_merchant(
    merchant_id: str,
    payload: AdminMerchantPatchIn,
    admin: str = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    patch = {
        k: v for k, v in payload.patch.items()
        if k in merchant_repo.ADMIN_EDITABLE_FIELDS
    }
    if not patch:
        raise HTTPException(400, "No editable fields in patch.")

    if patch.get("gstin") and str(patch["gstin"]).strip():
        existing_gstin = await merchant_repo.get_by_gstin(db, str(patch["gstin"]))
        if existing_gstin and existing_gstin["id"] != merchant_id:
            raise HTTPException(409, "This GSTIN is already registered.")

    updated = await merchant_repo.update(db, merchant_id, patch)
    if not updated:
        raise HTTPException(404, "Merchant not found.")

    logger.info(
        "admin action: %s on merchant=%s reason=%r by=%s",
        payload.action, merchant_id, payload.reason, admin,
    )

    # Trigger a real push notification for specified admin actions
    action_map = {
        "Credit Adjustment": ("PDF Credits Adjusted", "Your PDF credits have been adjusted by the admin."),
        "Grant Validity": ("Validity Extended", "Your plan validity has been extended by the admin."),
        "Change Plan": ("Plan Updated by Admin", "Your subscription plan has been updated by the admin."),
        "Reactivate Merchant": ("Account Reactivated", "Your account has been reactivated by the admin."),
        "Suspend Merchant": ("Account Suspended", "Your account has been suspended. Please contact support."),
        "Disable Merchant": ("Account Disabled", "Your account has been disabled. Please contact support.")
    }
    
    action = payload.action
    if action in action_map:
        title, base_body = action_map[action]
        body = f"{base_body} Reason: {payload.reason}" if payload.reason else base_body
        try:
            await push_service.send_to_merchant(db, merchant_id, title=title, body=body)
        except Exception as push_err:
            logger.error(f"Silent failure sending push notification on admin action {action}: {push_err}")

    return {"ok": True, "merchant": {k: v for k, v in updated.items() if k != "mpin"}}


# ---------------- support tickets ----------------
@router.get("/tickets")
async def list_tickets(
    _admin: str = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    tickets = await support_ticket_repo.list_all(db)
    return {"ok": True, "tickets": tickets}


@router.post("/tickets/{ticket_id}/reply")
async def reply_ticket(
    ticket_id: str,
    payload: TicketReplyIn,
    _admin: str = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    ticket = await support_ticket_repo.get_ticket(db, ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket not found.")
    
    updated = await support_ticket_repo.update_ticket(
        db, ticket_id, {"reply": payload.reply, "status": payload.status}
    )
    return {"ok": True, "ticket": updated}


# ---------------- QR inventory (see qr_inventory_repo.py, migration 0008) ----------------
# Real replacement for the old admin-only-localStorage QR pool: generating a
# batch here writes real rows to Postgres, and assigning a code writes
# straight into merchants."qrId" — the exact column the existing customer
# /pay/:qrId flow already reads (backend/app/merchant_repo.py.get_by_qr_id) —
# so a printed sticker works for every customer, on every device, the moment
# it's assigned, with zero changes needed to that flow.
@router.get("/qr-inventory")
async def list_qr_inventory(
    _admin: str = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    rows = await qr_inventory_repo.list_all(db)
    return {"ok": True, "items": rows}


@router.post("/qr-inventory/generate")
async def generate_qr_inventory(
    payload: QrGenerateIn,
    admin: str = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    rows = await qr_inventory_repo.generate_batch(db, payload.count, plans_ms.now_ms())
    logger.info("admin action: generated %d QR code(s) by=%s", len(rows), admin)
    return {"ok": True, "items": rows}


@router.post("/qr-inventory/{code}/assign")
async def assign_qr_inventory(
    code: str,
    payload: QrAssignIn,
    admin: str = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    merchant = await merchant_repo.get_by_id_light(db, payload.merchantId)
    if not merchant:
        raise HTTPException(404, "Merchant not found.")

    updated = await qr_inventory_repo.assign(db, code, payload.merchantId, plans_ms.now_ms())
    if not updated:
        existing = await qr_inventory_repo.get_by_code(db, code)
        if not existing:
            raise HTTPException(404, "QR code not found in inventory.")
        raise HTTPException(409, "This QR code is already assigned — unassign it first.")

    logger.info(
        "admin action: assigned QR %s to merchant=%s by=%s",
        code, payload.merchantId, admin,
    )
    return {"ok": True, "item": updated}


@router.post("/qr-inventory/{code}/unassign")
async def unassign_qr_inventory(
    code: str,
    admin: str = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    updated = await qr_inventory_repo.unassign(db, code)
    if not updated:
        raise HTTPException(404, "QR code not found in inventory.")

    logger.info("admin action: unassigned QR %s by=%s", code, admin)
    return {"ok": True, "item": updated}


class AdminBroadcastIn(BaseModel):
    title: str
    body: str
    merchantIds: list[str] | None = None


@router.post("/broadcast")
async def admin_broadcast(
    payload: AdminBroadcastIn,
    _admin: str = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    try:
        if payload.merchantIds is not None and len(payload.merchantIds) > 0:
            sent_count = await push_service.send_to_merchants(
                db,
                merchant_ids=payload.merchantIds,
                title=payload.title,
                body=payload.body
            )
        else:
            sent_count = await push_service.send_broadcast(
                db,
                title=payload.title,
                body=payload.body
            )
        return {"ok": True, "sentCount": sent_count}
    except Exception as ex:
        logger.error(f"Failed to send broadcast: {ex}")
        raise HTTPException(status_code=500, detail=f"Failed to send broadcast push notification: {ex}")


# ---------------- network feature flags (B2B marketplace toggle) ----------------

class NetworkFeatureFlagUpdate(BaseModel):
    enabled: bool


@router.get("/network-feature-flags")
async def get_network_flags(
    _admin: str = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    from .. import feature_flags_repo
    enabled = await feature_flags_repo.is_enabled(db, "merchant_network_enabled")
    return {"merchant_network_enabled": enabled}


@router.post("/network-feature-flags")
async def toggle_network_flag(
    payload: NetworkFeatureFlagUpdate,
    admin: str = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    from .. import feature_flags_repo
    success = await feature_flags_repo.set_enabled(db, "merchant_network_enabled", payload.enabled, admin_id=admin)
    return {"ok": success, "merchant_network_enabled": payload.enabled}


# ---------------- Feature Flags & Per-Merchant Overrides ----------------

class MerchantFeatureFlagOverrideIn(BaseModel):
    merchantId: str
    flagKey: str
    enabled: bool


class GlobalFeatureFlagUpdateIn(BaseModel):
    flagKey: str
    enabled: bool


@router.get("/feature-flags")
async def get_all_feature_flags(
    _admin: str = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin endpoint: Retrieves all global feature flags and per-merchant overrides."""
    from .. import feature_flags_repo
    data = await feature_flags_repo.list_all_flags_and_overrides(db)
    return {"ok": True, **data}


@router.post("/feature-flags/merchant-override")
async def set_merchant_feature_flag_override(
    payload: MerchantFeatureFlagOverrideIn,
    admin: str = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin endpoint: Sets or updates a feature flag override for a specific merchant."""
    from .. import feature_flags_repo
    merchant = await merchant_repo.get_by_id_light(db, payload.merchantId)
    if not merchant:
        raise HTTPException(404, "Merchant not found.")

    success = await feature_flags_repo.set_enabled(
        db,
        flag_key=payload.flagKey,
        enabled=payload.enabled,
        admin_id=admin,
        merchant_id=payload.merchantId,
    )
    logger.info("admin action: set flag %s=%s for merchant=%s by=%s", payload.flagKey, payload.enabled, payload.merchantId, admin)
    return {
        "ok": success,
        "merchantId": payload.merchantId,
        "flagKey": payload.flagKey,
        "enabled": payload.enabled,
        "message": f"Flag '{payload.flagKey}' set to {payload.enabled} for {merchant.get('shopName', 'merchant')}."
    }


@router.delete("/feature-flags/merchant-override")
async def delete_merchant_feature_flag_override(
    merchantId: str,
    flagKey: str,
    admin: str = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin endpoint: Removes a merchant's override, reverting them back to the global default."""
    from .. import feature_flags_repo
    deleted = await feature_flags_repo.remove_merchant_override(db, flagKey, merchantId)
    logger.info("admin action: removed flag override %s for merchant=%s by=%s", flagKey, merchantId, admin)
    return {"ok": True, "removed": deleted, "merchantId": merchantId, "flagKey": flagKey}


@router.post("/feature-flags/global")
async def set_global_feature_flag(
    payload: GlobalFeatureFlagUpdateIn,
    admin: str = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin endpoint: Updates a global feature flag default."""
    from .. import feature_flags_repo
    success = await feature_flags_repo.set_enabled(
        db,
        flag_key=payload.flagKey,
        enabled=payload.enabled,
        admin_id=admin,
        merchant_id=None,
    )
    logger.info("admin action: set global flag %s=%s by=%s", payload.flagKey, payload.enabled, admin)
    return {"ok": success, "flagKey": payload.flagKey, "enabled": payload.enabled}

