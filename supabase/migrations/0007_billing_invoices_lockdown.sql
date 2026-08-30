-- Billing requests + invoices: RLS hardening Phase 3 — the actual lockdown.
--
-- CONTEXT: 0004 opened `using (true)` / `with check (true)` on SELECT,
-- INSERT (both tables) and UPDATE (billing_requests) because, at the time,
-- nothing else in the app could reach these tables except the browser
-- talking directly to PostgREST with the public anon key (which ships
-- inside the JS bundle by design). That meant:
--   - Anyone holding the anon key could SELECT * from billing_requests or
--     invoices and download every merchant's customers' names, phones,
--     emails, GSTIN/PAN, addresses and payment references, across every
--     merchant on the platform (no merchant isolation at all).
--   - Anyone could UPDATE any billing_requests row — including flipping
--     status to 'approved' on someone else's request, or editing amounts/
--     items on a pending request before a merchant ever looks at it.
--   - Anyone could INSERT a row directly into invoices — i.e. fabricate an
--     "approved" invoice for any merchantId without ever going through the
--     app's credit/approval flow.
--
-- FIX: exactly the same remediation already applied to merchants in
-- supabase/migrations/0005_merchants_lockdown.sql — move every read/write
-- behind the FastAPI backend (backend/app/routers/billing.py), which
-- connects with the `postgres` role (BYPASSRLS) via merchant_repo.py's
-- sibling, billing_repo.py. The backend enforces the invariants Postgres
-- RLS never could without a real per-row auth context:
--   - merchant reads/writes are scoped to `"merchantId" = <JWT subject>`
--     (backend/app/security.py's require_merchant), so one merchant can
--     never see or touch another merchant's requests/invoices.
--   - approval is atomic: an invoice can only be created together with
--     flipping its own request to 'approved' in the same DB transaction,
--     and only for a request that is still 'pending' and belongs to the
--     authenticated merchant.
--   - the public, unauthenticated endpoints a customer legitimately needs
--     (submit a request with no login; poll their own request/invoice by
--     its own unguessable id) are narrow, single-row lookups server-side —
--     never a bulk `select *` an anon client could run directly against
--     PostgREST to enumerate every merchant's data.
--
-- This migration is IDEMPOTENT: safe to re-run.

-- ---------------- 1. Drop every open anon policy ----------------
drop policy if exists "billing_requests_public_select" on public.billing_requests;
drop policy if exists "billing_requests_public_insert" on public.billing_requests;
drop policy if exists "billing_requests_public_update" on public.billing_requests;
drop policy if exists "invoices_public_select" on public.invoices;
drop policy if exists "invoices_public_insert" on public.invoices;

-- No replacement policy is added for anon/authenticated on either table.
-- With RLS enabled + forced and zero matching policies, Postgres denies
-- SELECT/INSERT/UPDATE/DELETE to every role except the table owner and
-- roles with BYPASSRLS (the backend's `postgres` connection, same as
-- merchants). This is the actual fix — everything else in this file is
-- belt-and-braces.
alter table public.billing_requests enable row level security;
alter table public.billing_requests force row level security;
alter table public.invoices enable row level security;
alter table public.invoices force row level security;

-- Explicitly revoke any lingering direct anon/authenticated grants (some
-- Supabase projects carry a blanket GRANT ALL from initial setup).
revoke all on public.billing_requests from anon;
revoke all on public.billing_requests from authenticated;
revoke all on public.invoices from anon;
revoke all on public.invoices from authenticated;

-- ---------------- 2. Realtime is no longer usable from the browser ----------------
-- supabase-js's `postgres_changes` realtime payloads are themselves subject
-- to RLS for the anon role; with anon denied entirely, the frontend's old
-- `RemoteTable` realtime subscription (src/lib/db.ts) would receive nothing
-- and was removed in favour of the backend endpoints above, called on
-- mount + short polling (src/lib/services.ts). Leaving these tables in the
-- supabase_realtime publication is harmless (it's just unreachable to
-- anon now) so it is intentionally left as-is rather than reverted.
