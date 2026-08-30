-- Merchants: RLS hardening (Phase 1 of 2).
--
-- >>> PHASE 2 IS DONE: see 0005_merchants_lockdown.sql. <<<
-- The WARNING immediately below described why the open base-table
-- policies could not be dropped yet at the time this file was written.
-- That is no longer true — 0005 drops them. This file is kept as-is for
-- history; do not re-apply its policies after 0005 has run.
--
-- CONTEXT: 0001_merchants_canonical_schema.sql opened `using (true)` /
-- `with check (true)` policies for SELECT, INSERT, and UPDATE on
-- public.merchants to the anon key. That means any caller holding the
-- public anon key (which ships inside the frontend JS bundle by design)
-- can currently read AND overwrite every column of every merchant row —
-- MPIN digest, bank account number, IFSC, PAN, GSTIN, UPI ID, pdfCredits,
-- planExpiresAt, status — everything. This is the single highest-risk
-- finding in the security audit.
--
-- WARNING — DO NOT drop/replace the existing SELECT/INSERT/UPDATE
-- policies yet. As of this migration, the frontend has NO Supabase Auth
-- session anywhere (registration, login, profile edits, admin
-- suspend/activate, and plan purchase all write to this table directly
-- with the anon key, with no auth.uid() to scope a policy against).
-- Locking the base table down today, before that is fixed, would break
-- registration, login, and self-service plan purchase for every merchant
-- — not just tighten security. That is a decision point, not a drop-in
-- fix; see the two options below.
--
-- What THIS migration does (safe, additive, non-breaking):
--   1. Adds a restricted public view exposing only the non-sensitive
--      columns a QR-code customer scan legitimately needs, so any new
--      code path (e.g. CustomerFlow.tsx) can be migrated onto it without
--      waiting for the bigger fix.
--   2. Documents, but does not yet apply, the two remediation paths for
--      Phase 2.
--
-- ---------------- Phase 1: safe, additive ----------------

create or replace view public.merchants_public as
  select id, "shopName", "tradeName", gstin, state, "qrId", "logoDataUrl",
         "brandColor", "brandName", "invoicePrefix",
         "planExpiresAt", "planValidityDays"
  from public.merchants
  where status <> 'suspended';

grant select on public.merchants_public to anon;

-- ---------------- Phase 2: pick ONE of the following ----------------
--
-- Option A (recommended — matches the existing "don't redesign"
-- instruction, since this flow already exists and merchant.py already
-- expects it): migrate merchant registration/login/profile writes to go
-- through the FastAPI backend's `require_merchant` JWT flow, the same way
-- billing-request approval and plan purchase already do. Once every write
-- to this table originates from the backend (using the Supabase
-- *service* key, which bypasses RLS), the anon INSERT/UPDATE policies
-- below can simply be dropped — the anon key would then only ever need
-- SELECT on merchants_public above, never the base table.
--
-- Option B: adopt Supabase Auth so RLS can check auth.uid(). Example
-- shape once merchants gain an `auth_user_id` column tied to a Supabase
-- Auth session:
--
--   drop policy if exists "merchants_public_select" on public.merchants;
--   drop policy if exists "merchants_public_update" on public.merchants;
--
--   create policy "merchants_owner_select"
--     on public.merchants for select
--     using (auth.uid() = auth_user_id);
--
--   create policy "merchants_owner_update"
--     on public.merchants for update
--     using (auth.uid() = auth_user_id)
--     with check (auth.uid() = auth_user_id);
--
-- Whichever option is chosen, the end state must never leave `using (true)`
-- on SELECT or UPDATE for the base merchants table.
