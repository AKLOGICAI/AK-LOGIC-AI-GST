-- Shared, multi-worker-safe storage for OTP records, login lockout, and
-- rate-limit windows.
--
-- ROOT CAUSE: backend/app/main.py's otp_store, backend/app/routers/
-- merchant.py's _login_locks, backend/app/routers/admin.py's
-- _admin_login_locks, and backend/app/routers/billing.py's
-- _create_buckets were all plain in-process Python dicts. That is only
-- correct for a single Uvicorn/Gunicorn worker with no restarts — as
-- soon as the backend runs with more than one worker/instance, each one
-- has its own copy: an OTP issued by worker A is invisible to worker B's
-- /verify-otp, a merchant/admin locked out on one worker can freely
-- retry on another, and per-IP rate limits reset whenever a request
-- lands on a different worker.
--
-- FIX: this table, backing backend/app/rate_limit_repo.py. Every worker
-- and every instance talks to the SAME Postgres database (the same one
-- `DATABASE_URL` already points at for `public.merchants` etc.), so
-- state is now genuinely shared cluster-wide. See rate_limit_repo.py's
-- module docstring for the full concurrency design (Postgres advisory
-- locks per key).
--
-- This table is also created automatically at backend startup
-- (idempotent `CREATE TABLE IF NOT EXISTS`, see main.py's startup hook)
-- so a fresh local/dev database doesn't need this migration run by hand
-- first. It's included here to keep the Supabase-hosted schema
-- documented and versioned alongside every other table this project
-- owns.
CREATE TABLE IF NOT EXISTS public.auth_rate_state (
    key text PRIMARY KEY,
    data jsonb NOT NULL,
    -- Unix timestamp (seconds) after which this row is safe to garbage
    -- collect — always set to comfortably past every expiry/lockout the
    -- record itself carries. Swept opportunistically; not a source of
    -- truth for whether a record is "current" (the fields inside `data`
    -- are), only for when it's safe to delete.
    purge_after double precision NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Speeds up the periodic `DELETE ... WHERE purge_after < now()` sweep.
CREATE INDEX IF NOT EXISTS auth_rate_state_purge_after_idx
    ON public.auth_rate_state (purge_after);

-- No RLS policy is defined here on purpose: this table holds no
-- merchant/customer data (just OTP codes, IP addresses, and attempt
-- counters), and is only ever accessed by the backend's own
-- BYPASSRLS-role connection — the same trust model already used for
-- `public.merchants` (see 0005_merchants_lockdown.sql). It is never
-- exposed via PostgREST/anon key.
