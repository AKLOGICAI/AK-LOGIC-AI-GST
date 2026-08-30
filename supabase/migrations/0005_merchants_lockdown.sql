-- Merchants: RLS hardening Phase 2 — the actual lockdown.
--
-- CONTEXT: 0001 opened `using (true)` / `with check (true)` on SELECT,
-- INSERT and UPDATE for public.merchants — anyone holding the public anon
-- key (which ships inside the frontend bundle by design) could read or
-- overwrite every column of every merchant row: MPIN digest, bank account
-- number, IFSC, PAN, GSTIN, UPI ID, pdfCredits, planExpiresAt, status.
-- 0002 added a safe `merchants_public` view but deliberately left the open
-- base-table policies in place, because at that point nothing else in the
-- app could write to merchants without them (no backend-mediated write
-- path existed yet).
--
-- That write path now exists: backend/app/routers/merchant.py (register/
-- login/profile-edit/plan-purchase, JWT-authenticated) and
-- backend/app/routers/admin.py (admin merchant management, JWT-
-- authenticated), both going through backend/app/merchant_repo.py using
-- the backend's OWN direct Postgres connection (DATABASE_URL, the
-- `postgres` role — see config.py), which has BYPASSRLS and therefore
-- does not need any policy below to keep working.
--
-- This migration is safe to run now: it does not remove any capability
-- the frontend still needs directly from Supabase with the anon key —
-- that's down to exactly one thing, the public QR-scan lookup, which
-- already goes through `merchants_public`, not the base table.
--
-- This migration is IDEMPOTENT: safe to re-run.

-- ---------------- 1. Drop every open anon policy on the base table ----------------
drop policy if exists "merchants_public_select" on public.merchants;
drop policy if exists "merchants_public_insert" on public.merchants;
drop policy if exists "merchants_public_update" on public.merchants;

-- No replacement policy is added for anon/authenticated. With RLS enabled
-- and zero matching policies, Postgres denies SELECT/INSERT/UPDATE/DELETE
-- to every role except the table owner and roles with BYPASSRLS (the
-- backend's `postgres` connection). This is the actual fix.
alter table public.merchants enable row level security;
alter table public.merchants force row level security;

-- ---------------- 2. Public view stays, widened to match what the ----------------
-- ----------------    frontend's old PUBLIC_MERCHANT_COLUMNS selected ----------------
-- Keeping the exact same column set the frontend already expects
-- (src/lib/services.ts: PUBLIC_MERCHANT_COLUMNS) means CustomerFlow.tsx /
-- QRPage.tsx need zero changes — they now read from this view instead of
-- the base table, with an identical shape.
--
-- DROP + CREATE (not CREATE OR REPLACE): 0003's version of this view had
-- a different column order and a `where status <> 'suspended'` filter.
-- Postgres' CREATE OR REPLACE VIEW cannot reorder or rename existing
-- output columns — only append new ones — so replacing it in place would
-- fail here. This view intentionally exposes `status` itself (instead of
-- filtering suspended rows out) so the frontend's existing suspended/
-- disabled handling in CustomerFlow.tsx keeps working unchanged.
drop view if exists public.merchants_public;
create view public.merchants_public as
  select id, "shopName", "tradeName", gstin, state, status, "logoDataUrl",
         "qrId", "planExpiresAt", "planValidityDays", "invoicePrefix",
         "brandColor", "brandName"
  from public.merchants;

grant select on public.merchants_public to anon;
grant select on public.merchants_public to authenticated;

-- Explicitly revoke any lingering direct anon/authenticated grants on the
-- base table (belt-and-braces alongside the RLS policies above — Supabase
-- projects sometimes carry a blanket GRANT ALL from earlier setup).
revoke all on public.merchants from anon;
revoke all on public.merchants from authenticated;
