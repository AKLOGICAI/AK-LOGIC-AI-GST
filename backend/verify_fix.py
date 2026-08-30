"""End-to-end verification for the multi-worker-safe OTP/lockout/rate-limit
fix (rate_limit_repo.py).

WHY THIS SCRIPT: it could not be run inside the sandbox this fix was
written in (no network/Postgres access there). Run this yourself, from
the `backend/` folder, against your REAL `DATABASE_URL` (the same one in
your `.env`), to confirm the fix actually works end-to-end before you
deploy it.

USAGE:
    cd backend
    pip install -r requirements.txt
    export DATABASE_URL=postgresql+asyncpg://postgres:<password>@<host>:5432/postgres
    python verify_fix.py

It does NOT start a real HTTP server — it calls the app's own modules
directly (same functions the routes call), which is faster and doesn't
require Twilio/Razorpay/anything else to be configured. It uses
throwaway phone numbers / IPs so it's safe to run against your real
database (it cleans up after itself).

What it checks:
  1. Startup: the shared `public.auth_rate_state` table can be created.
  2. OTP: send -> verify (correct code) succeeds, and the code cannot be
     reused (one-time use).
  3. OTP: wrong code is rejected; after 5 wrong codes the phone number is
     locked out, and a 6th attempt (even with the RIGHT code) is refused
     because it's locked.
  4. OTP resend cooldown: sending twice in a row without waiting is
     refused.
  5. Merchant login lockout: 5 wrong MPINs lock the phone number; the
     lock is visible immediately to a SECOND, independent DB session
     (simulating a second worker process) — this is the actual point of
     the fix.
  6. Admin login lockout: same as above, keyed by IP.
  7. Per-IP rate limiting: N+1th request in a window is blocked; a fresh
     key is not affected by another key's count.
"""
import asyncio
import os
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))

from app import rate_limit_repo  # noqa: E402
from app.database import SessionLocal  # noqa: E402

PASS = "PASS"
FAIL = "FAIL"
_results: list[tuple[str, str, str]] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    _results.append((PASS if condition else FAIL, name, detail))
    print(f"[{PASS if condition else FAIL}] {name}" + (f" — {detail}" if detail and not condition else ""))


async def cleanup(keys: list[str]) -> None:
    async with SessionLocal() as db:
        for k in keys:
            await rate_limit_repo.delete(db, k)


async def main() -> None:
    stamp = int(time.time())
    test_phone = f"+91TESTFIX{stamp}"
    test_ip_otp = f"9.9.9.{stamp % 255}"
    test_ip_login = f"8.8.8.{stamp % 255}"
    test_ip_admin = f"7.7.7.{stamp % 255}"
    keys_to_clean = [
        f"otp:{test_phone}",
        f"ip_window:send-otp:{test_ip_otp}",
        f"ip_window:verify-otp:{test_ip_otp}",
        f"login_lock:merchant:{test_phone}",
        f"login_lock:admin:{test_ip_admin}",
    ]

    print("=== 1. Schema / startup ===")
    async with SessionLocal() as db:
        await rate_limit_repo.ensure_schema(db)
    check("auth_rate_state table can be created/verified", True)

    print("\n=== 2. OTP send + verify (happy path) ===")
    async with SessionLocal() as db:
        prep = await rate_limit_repo.otp_prepare_send(
            db, test_phone, time.time(), ttl_seconds=300, resend_cooldown_seconds=60, lockout_seconds=900,
        )
    check("OTP send returns a code", prep.get("status") == "ok" and "code" in prep, str(prep))
    code = prep.get("code", "")

    async with SessionLocal() as db:
        result = await rate_limit_repo.otp_verify(
            db, test_phone, code, time.time(), max_attempts=5, lockout_seconds=900,
        )
    check("Correct OTP verifies successfully", result.get("status") == "success", str(result))

    async with SessionLocal() as db:
        result2 = await rate_limit_repo.otp_verify(
            db, test_phone, code, time.time(), max_attempts=5, lockout_seconds=900,
        )
    check("OTP cannot be reused (one-time use)", result2.get("status") == "missing", str(result2))

    print("\n=== 3. OTP resend cooldown ===")
    async with SessionLocal() as db:
        prep1 = await rate_limit_repo.otp_prepare_send(
            db, test_phone, time.time(), ttl_seconds=300, resend_cooldown_seconds=60, lockout_seconds=900,
        )
    async with SessionLocal() as db:
        prep2 = await rate_limit_repo.otp_prepare_send(
            db, test_phone, time.time(), ttl_seconds=300, resend_cooldown_seconds=60, lockout_seconds=900,
        )
    check("Immediate resend is refused (cooldown)", prep2.get("status") == "cooldown", str(prep2))

    await cleanup([f"otp:{test_phone}"])

    print("\n=== 4. OTP brute-force lockout ===")
    async with SessionLocal() as db:
        prep = await rate_limit_repo.otp_prepare_send(
            db, test_phone, time.time(), ttl_seconds=300, resend_cooldown_seconds=0, lockout_seconds=900,
        )
    real_code = prep["code"]
    wrong_code = "000000" if real_code != "000000" else "111111"
    last_status = None
    for _ in range(5):
        async with SessionLocal() as db:
            r = await rate_limit_repo.otp_verify(
                db, test_phone, wrong_code, time.time(), max_attempts=5, lockout_seconds=900,
            )
        last_status = r.get("status")
    check("5th wrong OTP attempt triggers lockout", last_status == "locked_now", str(last_status))

    async with SessionLocal() as db:
        r_locked = await rate_limit_repo.otp_verify(
            db, test_phone, real_code, time.time(), max_attempts=5, lockout_seconds=900,
        )
    check("Locked phone rejects even the CORRECT OTP", r_locked.get("status") == "locked", str(r_locked))

    await cleanup([f"otp:{test_phone}"])

    print("\n=== 5. Merchant login lockout (cross-session = simulated cross-worker) ===")
    lock_key = f"login_lock:merchant:{test_phone}"
    for _ in range(4):
        async with SessionLocal() as db:  # each iteration = a fresh session, like a fresh request
            await rate_limit_repo.record_failed_login(db, lock_key, max_attempts=5, lockout_seconds=900)
    async with SessionLocal() as db:
        locked_until = await rate_limit_repo.record_failed_login(db, lock_key, max_attempts=5, lockout_seconds=900)
    check("5th failed login triggers lockout", locked_until is not None, str(locked_until))

    # Simulate a completely independent "worker" checking the lock with its
    # own fresh session/connection — this is exactly what the old in-memory
    # dict could NOT do across processes.
    async with SessionLocal() as other_worker_db:
        still_locked = await rate_limit_repo.check_lockout(other_worker_db, lock_key)
    check(
        "Lock set by one session is immediately visible to a second, independent session",
        still_locked is not None,
        str(still_locked),
    )

    async with SessionLocal() as db:
        await rate_limit_repo.clear_lockout(db, lock_key)
    async with SessionLocal() as db:
        cleared = await rate_limit_repo.check_lockout(db, lock_key)
    check("clear_lockout() actually clears it", cleared is None, str(cleared))

    print("\n=== 6. Admin login lockout ===")
    admin_key = f"login_lock:admin:{test_ip_admin}"
    for _ in range(4):
        async with SessionLocal() as db:
            await rate_limit_repo.record_failed_login(db, admin_key, max_attempts=5, lockout_seconds=900)
    async with SessionLocal() as db:
        admin_locked_until = await rate_limit_repo.record_failed_login(db, admin_key, max_attempts=5, lockout_seconds=900)
    check("5th failed admin login triggers lockout", admin_locked_until is not None, str(admin_locked_until))
    await cleanup([admin_key])

    print("\n=== 7. Per-IP rate limiting ===")
    window_key = f"ip_window:send-otp:{test_ip_otp}"
    limited = False
    for _ in range(11):  # limit is 10
        async with SessionLocal() as db:
            limited = await rate_limit_repo.check_and_increment_window(db, window_key, max_requests=10, window_seconds=900)
    check("11th request in a 10-request window is blocked", limited is True)

    other_key = f"ip_window:send-otp:9.9.9.{(stamp + 1) % 255}"
    async with SessionLocal() as db:
        other_limited = await rate_limit_repo.check_and_increment_window(db, other_key, max_requests=10, window_seconds=900)
    check("A different IP's window is unaffected", other_limited is False)
    await cleanup([window_key, other_key])

    await cleanup(keys_to_clean)

    print("\n=== SUMMARY ===")
    failed = [r for r in _results if r[0] == FAIL]
    print(f"{len(_results) - len(failed)}/{len(_results)} checks passed.")
    if failed:
        print("FAILED CHECKS:")
        for status, name, detail in failed:
            print(f"  - {name}: {detail}")
        sys.exit(1)
    print("All checks passed. The Postgres-backed fix behaves correctly.")


if __name__ == "__main__":
    asyncio.run(main())
