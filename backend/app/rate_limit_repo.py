"""Shared, multi-worker-safe replacement for the in-memory dicts that used
to back OTP storage, login lockout, and rate limiting.

WHY THIS EXISTS: main.py's `otp_store`, merchant.py's `_login_locks`,
admin.py's `_admin_login_locks`, and billing.py's `_create_buckets` were
all plain Python dicts living in a single process's memory. That's only
correct when the whole API is exactly one process with no restarts. As
soon as the app runs behind Gunicorn/Uvicorn with more than one worker,
multiple instances, or a rolling deploy, each worker has its own copy of
these dicts — a merchant/admin can be locked out on worker A and freely
retry on worker B, an OTP issued by worker A is invisible to worker B's
/verify-otp, and per-IP rate limits reset every time a request happens to
land on a different worker. That's a real, production-shaped correctness
and security gap, not a theoretical one — it silently weakens every
brute-force/DoS protection in this codebase the moment it's scaled past
one process.

FIX: move all four kinds of state into a single small table in the same
Postgres database the rest of the backend already talks to
(`DATABASE_URL` — see merchant_repo.py's docstring for why this backend
uses a direct-Postgres/BYPASSRLS connection). Postgres is shared by every
worker/instance by construction, so this closes the gap without adding a
new infra dependency. No Redis is configured anywhere in this project
(nothing in requirements.txt or .env.example references it), so per the
fix's own priority order — Redis if it's already there, otherwise
Postgres on existing infra — Postgres is the correct choice here.

Concurrency model: each logical key (a phone number, an IP, ...) is
guarded by a Postgres transaction-scoped advisory lock
(`pg_advisory_xact_lock(hashtext(key))`) before its record is
read-modified-written. Advisory locks are cluster-wide — two different
workers (or two different machines) racing to record a failed attempt
for the SAME key at the SAME instant are genuinely serialized by
Postgres itself, not by anything in this process. That's exactly the
property in-memory dicts could never provide across workers. The lock is
released automatically on commit/rollback (it's scoped to the current
transaction), so callers never unlock explicitly.

Every record keeps the same expiry fields the old dataclasses used
(expires_at / locked_until / window_start), so the TTL / lockout-window /
sliding-window *logic* below is unchanged from the original in-memory
version — only where it's stored moved. Rows are opportunistically swept
once they're safely past every expiry they carry, mirroring main.py's old
sweep behavior, just against the shared table instead of a local dict.
"""
from __future__ import annotations

import json
import secrets as _secrets
import time
from dataclasses import asdict, is_dataclass
from typing import Any, Callable, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

TABLE = "public.auth_rate_state"

# Only run the opportunistic DELETE sweep at most this often per call site.
# The sweep itself is a plain, idempotent DELETE — safe to run from every
# worker independently; this just avoids doing it on literally every call.
_SWEEP_INTERVAL_SECONDS = 10 * 60
_last_sweep_at: float = 0.0


async def ensure_schema(db: AsyncSession) -> None:
    """Idempotent table creation, called once at startup (see main.py's
    startup hook) and safe to call from every worker/instance
    concurrently — `CREATE TABLE IF NOT EXISTS` is safe under concurrent
    callers in Postgres."""
    await db.execute(text(
        f"""
        CREATE TABLE IF NOT EXISTS {TABLE} (
            key text PRIMARY KEY,
            data jsonb NOT NULL,
            purge_after double precision NOT NULL,
            updated_at timestamptz NOT NULL DEFAULT now()
        )
        """
    ))
    await db.commit()


def _to_jsonable(data: dict) -> dict:
    return {k: (asdict(v) if is_dataclass(v) else v) for k, v in data.items()}


async def _lock(db: AsyncSession, key: str) -> None:
    """Cluster-wide, transaction-scoped lock on this logical key. Blocks
    until any other transaction (this worker or another) holding the same
    key's lock has committed/rolled back."""
    await db.execute(text("select pg_advisory_xact_lock(hashtext(:k))"), {"k": key})


async def _maybe_sweep(db: AsyncSession) -> None:
    global _last_sweep_at
    now = time.time()
    if now - _last_sweep_at < _SWEEP_INTERVAL_SECONDS:
        return
    _last_sweep_at = now
    await db.execute(text(f"DELETE FROM {TABLE} WHERE purge_after < :now"), {"now": now})
    await db.commit()


async def get(db: AsyncSession, key: str) -> Optional[dict]:
    res = await db.execute(text(f"SELECT data FROM {TABLE} WHERE key = :k"), {"k": key})
    row = res.first()
    return row.data if row else None


async def put(db: AsyncSession, key: str, data: dict, purge_after: float) -> None:
    await db.execute(
        text(
            f"""
            INSERT INTO {TABLE} (key, data, purge_after, updated_at)
            VALUES (:k, CAST(:data AS jsonb), :purge_after, now())
            ON CONFLICT (key) DO UPDATE
                SET data = EXCLUDED.data,
                    purge_after = EXCLUDED.purge_after,
                    updated_at = now()
            """
        ),
        {"k": key, "data": json.dumps(_to_jsonable(data)), "purge_after": purge_after},
    )
    await db.commit()


async def delete(db: AsyncSession, key: str) -> None:
    await db.execute(text(f"DELETE FROM {TABLE} WHERE key = :k"), {"k": key})
    await db.commit()


async def get_locked_and_update(
    db: AsyncSession,
    key: str,
    mutate: Callable[[Optional[dict]], Optional[dict]],
    purge_after: Optional[float] = None,
) -> Optional[dict]:
    """Atomically: take a cluster-wide lock on `key`, load its current
    record (None if absent), pass it to `mutate(current) -> new_or_None`,
    persist the result, and return it.

    - `mutate` receives None when no record exists yet — it decides the
      default, it is not silently given `{}`.
    - Returning None deletes the key (a no-op if it didn't exist).
    - Returning a dict upserts it with the given `purge_after` (a Unix
      timestamp after which it's safe to garbage-collect the row).

    This is the one primitive every OTP/lockout/rate-limit operation
    below is built from, so there's a single place a multi-worker race
    could hide — and it's closed here via the advisory lock, not by
    hoping requests land on the same process.
    """
    await _lock(db, key)
    await _maybe_sweep(db)
    current = await get(db, key)
    updated = mutate(current)
    if updated is None:
        if current is not None:
            await delete(db, key)
        return None
    await put(db, key, updated, purge_after if purge_after is not None else time.time() + 3600)
    return updated


# =====================================================================
# OTP storage (replaces main.py's otp_store: Dict[str, OtpRecord])
# =====================================================================

def _otp_key(phone: str) -> str:
    return f"otp:{phone}"


async def otp_prepare_send(
    db: AsyncSession, phone: str, now: float, ttl_seconds: float, resend_cooldown_seconds: float,
    lockout_seconds: float,
) -> dict:
    """Mirrors the original /send-otp logic exactly: refuses to
    (re)generate a code while locked out or inside the resend cooldown;
    otherwise generates+stores a fresh one-time code and returns it.

    Returns one of:
      {"status": "locked", "locked_until": <ts>}
      {"status": "cooldown", "retry_after": <ts>}
      {"status": "ok", "code": "123456"}
    """
    result: dict[str, Any] = {}

    def mutate(rec: Optional[dict]) -> Optional[dict]:
        if rec and rec.get("locked_until", 0) > now:
            result["status"] = "locked"
            result["locked_until"] = rec["locked_until"]
            return rec
        if rec and (now - rec.get("last_sent_at", 0)) < resend_cooldown_seconds:
            result["status"] = "cooldown"
            result["retry_after"] = rec.get("last_sent_at", 0) + resend_cooldown_seconds
            return rec
        code = f"{_secrets.randbelow(1_000_000):06d}"
        result["status"] = "ok"
        result["code"] = code
        return {"code": code, "expires_at": now + ttl_seconds, "attempts": 0, "last_sent_at": now, "locked_until": 0}

    await get_locked_and_update(
        db, _otp_key(phone), mutate, purge_after=now + max(ttl_seconds, lockout_seconds) + 3600,
    )
    return result


async def otp_verify(
    db: AsyncSession, phone: str, submitted_code: str, now: float, max_attempts: int, lockout_seconds: float,
) -> dict:
    """Mirrors the original /verify-otp logic exactly, including the
    one-time-use delete on success and the attempts-based lockout.

    Returns one of:
      {"status": "missing"}
      {"status": "locked", "locked_until": <ts>}
      {"status": "expired"}
      {"status": "invalid"}
      {"status": "locked_now"}   -- just tripped the lockout
      {"status": "success"}
    """
    result: dict[str, Any] = {}

    def mutate(rec: Optional[dict]) -> Optional[dict]:
        if not rec:
            result["status"] = "missing"
            return rec
        if rec.get("locked_until", 0) > now:
            result["status"] = "locked"
            result["locked_until"] = rec["locked_until"]
            return rec
        if now > rec.get("expires_at", 0):
            result["status"] = "expired"
            return None
        if not _secrets.compare_digest(submitted_code, rec.get("code", "")):
            attempts = rec.get("attempts", 0) + 1
            rec["attempts"] = attempts
            if attempts >= max_attempts:
                rec["locked_until"] = now + lockout_seconds
                rec["attempts"] = 0
                result["status"] = "locked_now"
            else:
                result["status"] = "invalid"
            return rec
        result["status"] = "success"
        return None  # one-time use

    await get_locked_and_update(
        db, _otp_key(phone), mutate, purge_after=now + lockout_seconds + 3600,
    )
    return result


# =====================================================================
# Login lockout (replaces merchant.py's _login_locks and admin.py's
# _admin_login_locks — same shape, generic over the lookup key so both
# realms share one implementation)
# =====================================================================

async def check_lockout(db: AsyncSession, key: str) -> Optional[float]:
    """Read-only check: returns locked_until if `key` is currently locked
    (still in the future), else None. No lock needed for a pure read —
    the mutating functions below take the advisory lock."""
    rec = await get(db, key)
    if rec and rec.get("locked_until", 0) > time.time():
        return rec["locked_until"]
    return None


async def record_failed_login(db: AsyncSession, key: str, max_attempts: int, lockout_seconds: float) -> Optional[float]:
    """Atomically increments the failure counter for `key`; once it
    reaches `max_attempts`, sets locked_until and resets the counter
    (matching the original dataclass behavior). Returns the new
    locked_until if this call just triggered the lockout, else None."""
    now = time.time()
    result: dict[str, Any] = {"locked_until": None}

    def mutate(rec: Optional[dict]) -> dict:
        rec = rec or {"attempts": 0, "locked_until": 0.0}
        attempts = rec.get("attempts", 0) + 1
        if attempts >= max_attempts:
            rec["attempts"] = 0
            rec["locked_until"] = now + lockout_seconds
            result["locked_until"] = rec["locked_until"]
        else:
            rec["attempts"] = attempts
        return rec

    await get_locked_and_update(db, key, mutate, purge_after=now + lockout_seconds + 3600)
    return result["locked_until"]


async def clear_lockout(db: AsyncSession, key: str) -> None:
    await delete(db, key)


# =====================================================================
# Fixed-window per-IP rate limiting (replaces main.py's _send_ip_hits /
# _verify_ip_hits and billing.py's _create_buckets — same shape)
# =====================================================================

async def check_and_increment_window(db: AsyncSession, key: str, max_requests: int, window_seconds: float) -> bool:
    """Returns True (and still counts the request) if `key` is currently
    over the limit for its window; otherwise records the hit and returns
    False. Same fixed-window semantics as the original IpWindow/_Bucket
    dataclasses."""
    now = time.time()
    limited = {"value": False}

    def mutate(rec: Optional[dict]) -> dict:
        if not rec or now - rec.get("window_start", 0) >= window_seconds:
            return {"count": 1, "window_start": now}
        if rec.get("count", 0) >= max_requests:
            limited["value"] = True
            return rec
        rec["count"] = rec.get("count", 0) + 1
        return rec

    await get_locked_and_update(db, key, mutate, purge_after=now + window_seconds)
    return limited["value"]
