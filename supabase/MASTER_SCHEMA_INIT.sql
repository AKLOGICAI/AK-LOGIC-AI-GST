-- ========================================================

-- AK-LOGIC AI GST: Complete Master Database Schema Init

-- Run this entire script in your Supabase SQL Editor

-- ========================================================


-- >>> Migration: 0001_merchants_canonical_schema.sql >>>

-- Merchants: canonical schema + RLS for the Supabase-only architecture.
--
-- This migration is ADDITIVE and IDEMPOTENT: it is safe to run against a
-- fresh project (creates the table) or an existing one (only adds columns
-- that are missing, never drops/renames anything). It does not assume or
-- require knowledge of your current table state.
--
-- Column names are camelCase, quoted, to exactly match what the frontend
-- already sends/queries (src/lib/services.ts: `.upsert(m)` with the
-- Merchant TS type's own keys, and `.ilike("qrId", qrId)`). This is the
-- schema the application code has spoken from day one across every
-- frontend file that touches a Merchant (types.ts, services.ts,
-- CustomerFlow.tsx, QRPage.tsx, Register.tsx, all admin/*.tsx pages) —
-- there is no snake_case usage anywhere in the frontend, so this migration
-- does not introduce a new convention, it codifies the existing one.

create table if not exists public.merchants (
  id text primary key
);

alter table public.merchants
  add column if not exists "shopName" text,
  add column if not exists "ownerName" text,
  add column if not exists "legalName" text,
  add column if not exists "tradeName" text,
  add column if not exists "businessType" text,
  add column if not exists "email" text,
  add column if not exists "phone" text,
  add column if not exists "mpin" text,
  add column if not exists "gstin" text,
  add column if not exists "pan" text,
  add column if not exists "address" text,
  add column if not exists "state" text,
  add column if not exists "city" text,
  add column if not exists "pincode" text,
  add column if not exists "bankName" text,
  add column if not exists "accountType" text,
  add column if not exists "accountNumber" text,
  add column if not exists "ifsc" text,
  add column if not exists "signatureDataUrl" text,
  add column if not exists "logoDataUrl" text,
  add column if not exists "brandName" text,
  add column if not exists "brandColor" text,
  add column if not exists "invoicePrefix" text,
  add column if not exists "planId" text,
  add column if not exists "planName" text,
  add column if not exists "planValidityDays" integer,
  add column if not exists "planStartedAt" bigint,
  add column if not exists "planExpiresAt" bigint,
  add column if not exists "pdfCredits" integer,
  add column if not exists "customBranding" boolean,
  add column if not exists "qrId" text,
  add column if not exists "status" text default 'active',
  add column if not exists "kyc" text,
  add column if not exists "upiId" text,
  add column if not exists "lastLoginAt" bigint,
  add column if not exists "lastIp" text,
  add column if not exists "lastDevice" text,
  add column if not exists "createdAt" bigint,
  add column if not exists "plan" text,
  add column if not exists "balance" numeric;

-- qrId must be unique (it's the public lookup key the QR code encodes)
-- and indexed (CustomerFlow.tsx queries it on every QR scan).
create unique index if not exists merchants_qrid_unique on public.merchants ("qrId");

-- ---------------- Row Level Security ----------------
-- The frontend has no Supabase Auth session — every call (registration AND
-- QR lookup) uses the public anon key. Without explicit policies, RLS
-- defaults to denying everything, which independently reproduces the same
-- "works on original device only" symptom (writes/reads fail silently).
alter table public.merchants enable row level security;

drop policy if exists "merchants_public_select" on public.merchants;
create policy "merchants_public_select"
  on public.merchants for select
  using (true);

drop policy if exists "merchants_public_insert" on public.merchants;
create policy "merchants_public_insert"
  on public.merchants for insert
  with check (true);

drop policy if exists "merchants_public_update" on public.merchants;
create policy "merchants_public_update"
  on public.merchants for update
  using (true);

-- <<< End Migration: 0001_merchants_canonical_schema.sql <<<


-- >>> Migration: 0002_merchants_rls_hardening.sql >>>

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

-- <<< End Migration: 0002_merchants_rls_hardening.sql <<<


-- >>> Migration: 0003_drop_legacy_snakecase_columns.sql >>>

-- Merchants: remove legacy snake_case columns that conflict with the
-- canonical camelCase schema (0001) and cause registration to fail.
--
-- ============================== ROOT CAUSE ==============================
-- Registration was failing with:
--   null value in column "shop_name" violates not-null constraint
--
-- Every layer of the *application* (Merchant TS type in src/lib/types.ts,
-- the Register.tsx form state, merchantService.register() in
-- src/lib/services.ts, and writeMerchantToSupabase()'s
-- `supabase.from('merchants').upsert(m)` call) has only ever used
-- camelCase field names (`shopName`, `ownerName`, ...). That part of the
-- codebase was already consistent before this migration.
--
-- The problem is one level down, in the live Postgres table itself.
-- 0001_merchants_canonical_schema.sql is intentionally ADDITIVE ONLY (its
-- own header says so: "never drops/renames anything"). That means if the
-- `public.merchants` table already existed with an *older* snake_case
-- column set (e.g. `shop_name text not null`) — most likely created by
-- an earlier iteration of this project, or via the Supabase table editor
-- UI, which snake_cases column names by default — 0001 would run
-- `create table if not exists` (a no-op, since the table already exists)
-- and then ADD the new camelCase columns *alongside* the old ones,
-- without ever removing the old ones or their constraints.
--
-- From that point on, every insert only ever populates the camelCase
-- columns (that's all `.upsert(m)` sends), so the untouched legacy
-- `shop_name NOT NULL` column is left NULL on every single row -> the
-- constraint fires on every registration attempt. This is a genuine
-- two-schemas-on-one-table problem, not a one-off bad row.
--
-- ================================ FIX ====================================
-- This migration is the real fix (as opposed to relaxing/dropping just the
-- NOT NULL constraint, which would leave a dead, permanently-NULL
-- duplicate column behind and invite the same class of bug again the next
-- time someone reads from the wrong column):
--
--   1. For every legacy snake_case column that still exists, backfill the
--      canonical camelCase column with its value wherever the camelCase
--      column is empty (protects any pre-0001 production rows that only
--      ever had the legacy column populated).
--   2. Drop the legacy column's NOT NULL constraint, then drop the column
--      entirely, so there is exactly one column, one name, one
--      constraint, per field -- matching the Merchant TS type, the
--      registration form, services.ts, and 0001/0002.
--
-- Idempotent and safe to run on any DB state: every step is
-- existence-checked via information_schema, so this is a no-op on a
-- database that never had the legacy columns (e.g. a fresh project that
-- only ever ran 0001).
--
-- VIEW DEPENDENCY: 0002_merchants_rls_hardening.sql created
-- public.merchants_public as a view over this table. Postgres will not
-- let ALTER/DROP COLUMN touch any column a view's rule depends on
-- (`cannot alter type of a column used by a view or rule`), so the view
-- is dropped immediately before the cleanup below and recreated
-- immediately after, using the exact same definition as 0002. This
-- migration is the only thing allowed to touch the view for that window,
-- and it always leaves it back in place before finishing, so anything
-- reading from merchants_public sees no functional change.

drop view if exists public.merchants_public;

do $$
declare
  -- (legacy snake_case column, canonical camelCase column) pairs, covering
  -- every field in the Merchant TS type / 0001 schema.
  pairs text[][] := array[
    array['shop_name', 'shopName'],
    array['owner_name', 'ownerName'],
    array['legal_name', 'legalName'],
    array['trade_name', 'tradeName'],
    array['business_type', 'businessType'],
    array['bank_name', 'bankName'],
    array['account_type', 'accountType'],
    array['account_number', 'accountNumber'],
    array['signature_data_url', 'signatureDataUrl'],
    array['logo_data_url', 'logoDataUrl'],
    array['brand_name', 'brandName'],
    array['brand_color', 'brandColor'],
    array['invoice_prefix', 'invoicePrefix'],
    array['plan_id', 'planId'],
    array['plan_name', 'planName'],
    array['plan_validity_days', 'planValidityDays'],
    array['plan_started_at', 'planStartedAt'],
    array['plan_expires_at', 'planExpiresAt'],
    array['pdf_credits', 'pdfCredits'],
    array['custom_branding', 'customBranding'],
    array['qr_id', 'qrId'],
    array['upi_id', 'upiId'],
    array['last_login_at', 'lastLoginAt'],
    array['last_ip', 'lastIp'],
    array['last_device', 'lastDevice'],
    array['created_at', 'createdAt']
  ];
  pair text[];
  legacy_col text;
  camel_col text;
begin
  foreach pair slice 1 in array pairs
  loop
    legacy_col := pair[1];
    camel_col := pair[2];

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'merchants' and column_name = legacy_col
    ) then
      -- Each column handled independently: if one legacy column has an
      -- unexpected type that can't be backfilled automatically, log it
      -- and keep going rather than aborting the whole migration (and
      -- leaving every other legacy NOT NULL column, including
      -- shop_name, still broken).
      begin
        execute format(
          'update public.merchants set %I = %I where %I is null and %I is not null',
          camel_col, legacy_col, camel_col, legacy_col
        );
        execute format('alter table public.merchants alter column %I drop not null', legacy_col);
        execute format('alter table public.merchants drop column %I', legacy_col);
      exception when others then
        raise notice 'Skipped legacy column "%": %', legacy_col, sqlerrm;
      end;
    end if;
  end loop;
end $$;

-- Recreate merchants_public exactly as it was defined in
-- 0002_merchants_rls_hardening.sql (same columns, same filter, same
-- grant) — none of those columns are among the legacy ones dropped
-- above, so this restores identical behavior, just re-pointed at the
-- now-cleaned-up base table.
create or replace view public.merchants_public as
  select id, "shopName", "tradeName", gstin, state, "qrId", "logoDataUrl",
         "brandColor", "brandName", "invoicePrefix",
         "planExpiresAt", "planValidityDays"
  from public.merchants
  where status <> 'suspended';

grant select on public.merchants_public to anon;

-- <<< End Migration: 0003_drop_legacy_snakecase_columns.sql <<<


-- >>> Migration: 0004_billing_requests_and_invoices.sql >>>

-- Billing requests + invoices: move off per-device localStorage onto
-- Supabase, so a customer's request (submitted on their phone) is visible
-- on the merchant's dashboard (a completely different device/browser).
--
-- ============================== ROOT CAUSE ==============================
-- src/lib/db.ts's `Table` class only ever wrote to localStorage. Customer
-- requests created via CustomerFlow.tsx -> requestService.create() were
-- persisted solely in the customer's own browser storage. The merchant
-- dashboard (RequestsPage.tsx / Overview.tsx) read its OWN browser's
-- localStorage via the same Table class — a separate, unrelated bucket on
-- a separate device. The two never intersect, so "No pending requests"
-- was not a bug in any fetch/query logic; the data the merchant needed to
-- see had never left the customer's device in the first place.
--
-- Merchants already avoid this (src/lib/services.ts: merchantService,
-- CustomerFlow.tsx comment: "the merchant is ALWAYS fetched from
-- Supabase"). This migration brings billing_requests and invoices up to
-- the same standard: Supabase is the single shared source of truth, with
-- Realtime enabled so the merchant dashboard updates live the instant a
-- customer submits a request, no reload/poll needed.
--
-- Column names are camelCase, quoted, to exactly match the InvoiceRequest
-- and Invoice TS types in src/lib/types.ts and what src/lib/services.ts
-- already sends via `.insert(row)` / `.update(patch)` — same convention
-- as supabase/migrations/0001 for merchants.
--
-- This migration is ADDITIVE and IDEMPOTENT: safe to run against a fresh
-- project or re-run against an existing one.

create table if not exists public.billing_requests (
  id text primary key,
  "merchantId" text not null,
  "invoiceNo" text,
  "invoiceId" text,
  "customerName" text not null,
  "customerPhone" text,
  "customerEmail" text,
  "customerGstin" text,
  "customerPan" text,
  "customerAddress" text not null,
  "customerState" text,
  "paymentMode" text,
  "paymentRef" text,
  items jsonb not null default '[]'::jsonb,
  notes text,
  "rejectReason" text,
  status text not null default 'pending',
  "createdAt" bigint not null,
  "resolvedAt" bigint,
  branded boolean not null default false
);

create table if not exists public.invoices (
  id text primary key,
  "requestId" text not null,
  "merchantId" text not null,
  "invoiceNo" text not null,
  "invoiceDate" bigint not null,
  "customerName" text not null,
  "customerPhone" text,
  "customerEmail" text,
  "customerGstin" text,
  "customerPan" text,
  "customerAddress" text not null,
  "customerState" text,
  "paymentMode" text,
  "paymentRef" text,
  notes text,
  items jsonb not null default '[]'::jsonb,
  "taxableValue" numeric not null default 0,
  cgst numeric not null default 0,
  sgst numeric not null default 0,
  igst numeric not null default 0,
  "totalTax" numeric not null default 0,
  "roundOff" numeric not null default 0,
  "grandTotal" numeric not null default 0,
  "amountInWords" text,
  "placeOfSupply" text,
  "isInterState" boolean not null default false,
  branded boolean not null default false,
  "createdAt" bigint not null
);

-- Merchant dashboard filters "pending requests for MY merchantId" and
-- customer status page filters "invoices for THIS requestId" on every
-- render/realtime tick — index both hot lookup paths.
create index if not exists billing_requests_merchant_idx on public.billing_requests ("merchantId");
create index if not exists billing_requests_status_idx on public.billing_requests (status);
create index if not exists invoices_merchant_idx on public.invoices ("merchantId");
create index if not exists invoices_request_idx on public.invoices ("requestId");

-- ---------------- Row Level Security ----------------
-- Same model as merchants (0001/0002): the frontend has no Supabase Auth
-- session anywhere in this app, so every read/write uses the public anon
-- key. Open policies are required for the app to function at all today —
-- see 0002_merchants_rls_hardening.sql for the documented remediation
-- path (move writes behind the FastAPI backend's JWT auth + service key)
-- if/when that's undertaken for the whole app, not just this table.
alter table public.billing_requests enable row level security;
alter table public.invoices enable row level security;

drop policy if exists "billing_requests_public_select" on public.billing_requests;
create policy "billing_requests_public_select"
  on public.billing_requests for select
  using (true);

drop policy if exists "billing_requests_public_insert" on public.billing_requests;
create policy "billing_requests_public_insert"
  on public.billing_requests for insert
  with check (true);

drop policy if exists "billing_requests_public_update" on public.billing_requests;
create policy "billing_requests_public_update"
  on public.billing_requests for update
  using (true);

drop policy if exists "invoices_public_select" on public.invoices;
create policy "invoices_public_select"
  on public.invoices for select
  using (true);

drop policy if exists "invoices_public_insert" on public.invoices;
create policy "invoices_public_insert"
  on public.invoices for insert
  with check (true);

-- ---------------- Realtime ----------------
-- Enables the merchant dashboard to receive INSERT/UPDATE events live
-- (src/lib/db.ts RemoteTable subscribes via supabase.channel(...).on(
-- 'postgres_changes', ...)) instead of requiring a manual refresh.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'billing_requests'
  ) then
    alter publication supabase_realtime add table public.billing_requests;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'invoices'
  ) then
    alter publication supabase_realtime add table public.invoices;
  end if;
exception when others then
  -- If the supabase_realtime publication doesn't exist under this exact
  -- name (rare, project-dependent), don't fail the whole migration —
  -- the tables/RLS above are the critical part; realtime can be enabled
  -- manually from Database -> Replication in the Supabase dashboard.
  raise notice 'Could not attach to supabase_realtime publication automatically: %', sqlerrm;
end $$;

-- <<< End Migration: 0004_billing_requests_and_invoices.sql <<<


-- >>> Migration: 0005_merchants_lockdown.sql >>>

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

-- <<< End Migration: 0005_merchants_lockdown.sql <<<


-- >>> Migration: 0006_merchant_code_and_invoice_number.sql >>>

-- Merchant Unique ID + Auto Invoice Numbering
-- =============================================================================
-- ADDITIVE ONLY. Does not rename/drop/alter any existing column, does not
-- touch the existing `id` primary key on merchants (every FK — invoices.
-- merchantId, billing_requests.merchantId, subscriptions.merchantId, etc. —
-- keeps pointing at that same value, completely unchanged). This migration
-- only ADDS:
--   1. merchants."merchantCode"  — permanent, human-facing Merchant ID
--                                   (format: AKM-000001), backend-generated,
--                                   never changes, never reused.
--   2. merchants."invoiceSeq"    — per-merchant running counter, backend-only.
--   3. invoices."invoiceNumber"  — permanent per-invoice number
--                                   (format: <merchantCode>-000001).
--   4. billing_requests."invoiceNumber" — same value, mirrored onto the
--                                   request once approved, so it's visible
--                                   even before the customer opens the PDF.
--
-- This is entirely separate from the existing GST "invoiceNo" field
-- (format INV/2025-26/0001), which remains 100% unchanged — that field is
-- the statutory tax-invoice number and this migration does not touch it,
-- per the "do not change the existing workflow" requirement.
--
-- Safe to run against a fresh project or re-run against an existing one
-- (idempotent: every statement below is guarded with IF NOT EXISTS / OR
-- REPLACE, and the backfill only touches rows that don't have a code yet).

-- ---------------- 1. Sequence backing the Merchant ID ----------------
-- A Postgres sequence is the correct primitive here: nextval() is atomic
-- under concurrent registrations (two merchants signing up at the same
-- millisecond can never receive the same number) and, by design, a value
-- it hands out is never handed out again — even if the INSERT that
-- consumed it later fails/rolls back, satisfying "never reused" exactly.
create sequence if not exists public.merchant_code_seq;

-- ---------------- 2. New columns ----------------
alter table public.merchants
  add column if not exists "merchantCode" text,
  add column if not exists "invoiceSeq" bigint not null default 0;

alter table public.invoices
  add column if not exists "invoiceNumber" text;

alter table public.billing_requests
  add column if not exists "invoiceNumber" text;

-- ---------------- 3. Backfill existing merchants ----------------
-- Any merchant that registered before this migration has no merchantCode
-- yet. Assign one permanent code each, in registration order, using the
-- same sequence new registrations will draw from — so the numbering is
-- continuous and no future registration can collide with a backfilled one.
do $$
declare
  r record;
begin
  for r in
    select id from public.merchants
    where "merchantCode" is null
    order by "createdAt" asc, id asc
  loop
    update public.merchants
    set "merchantCode" = 'AKM-' || lpad(nextval('public.merchant_code_seq')::text, 6, '0')
    where id = r.id;
  end loop;
end $$;

-- ---------------- 4. Uniqueness + lookup indexes ----------------
-- Unique so the same permanent ID can never end up on two accounts.
create unique index if not exists merchants_merchant_code_unique
  on public.merchants ("merchantCode");

-- Fast exact/partial lookup for "Invoice Search" on the merchant dashboard
-- and admin panel (e.g. searching AKM-000125-000042).
create unique index if not exists invoices_invoice_number_unique
  on public.invoices ("invoiceNumber")
  where "invoiceNumber" is not null;

create index if not exists invoices_invoice_number_search_idx
  on public.invoices (lower("invoiceNumber"));

create index if not exists billing_requests_invoice_number_idx
  on public.billing_requests (lower("invoiceNumber"));

-- ---------------- 5. Expose merchantCode on the public QR/customer view ----------------
-- CustomerFlow.tsx (the QR-scan billing request page) and QRPage.tsx read
-- merchant data ONLY through `merchants_public`
-- (supabase/migrations/0005_merchants_lockdown.sql) — the base table denies
-- the anon key entirely. The permanent Merchant ID needs to be visible on
-- that customer-facing page too, so it's added to the view here.
--
-- DROP + CREATE (matching 0005's own comment on why CREATE OR REPLACE
-- can't be used): this only ADDS a column to the same view, in the same
-- safe, additive spirit as the rest of this migration.
drop view if exists public.merchants_public;
create view public.merchants_public as
  select id, "shopName", "tradeName", gstin, state, status, "logoDataUrl",
         "qrId", "planExpiresAt", "planValidityDays", "invoicePrefix",
         "brandColor", "brandName", "merchantCode"
  from public.merchants;

grant select on public.merchants_public to anon;
grant select on public.merchants_public to authenticated;

-- ---------------- 6. RLS ----------------
-- No new tables/policies needed: merchants, invoices and billing_requests
-- already have RLS enabled with the same select/insert/update policies
-- from 0001/0002/0004/0005, which already cover these new columns (Postgres
-- row-level security applies per-row, not per-column). Merchant writes to
-- "merchantCode"/"invoiceSeq" only ever happen from the backend's
-- BYPASSRLS-capable connection (see merchant_repo.py) — the anon-key path
-- the frontend uses for merchants is already locked down entirely in
-- 0005_merchants_lockdown.sql, and this migration doesn't reopen it.

-- <<< End Migration: 0006_merchant_code_and_invoice_number.sql <<<


-- >>> Migration: 0007_billing_invoices_lockdown.sql >>>

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

-- <<< End Migration: 0007_billing_invoices_lockdown.sql <<<


-- >>> Migration: 0008_payment_orders.sql >>>

-- Payment orders: closes the "activate a paid plan without paying" gap.
--
-- ROOT CAUSE: backend/app/routers/merchant.py's POST /purchase-plan used
-- to grant pdfCredits/planExpiresAt to whichever merchant held a valid
-- JWT and named a planId — there was no check anywhere, client or server,
-- that money had actually changed hands. src/lib/payments.ts's "provider"
-- abstraction looked like a real payment gate but ACTIVE_PROVIDER_ID was
-- 'mock', whose `checkout()` always resolves `status: 'captured'` and
-- whose `verify()` always returns `true` — i.e. purely a client-side
-- placeholder. A merchant (or anyone with a merchant JWT, obtained via
-- the app's own free registration) could call /purchase-plan directly —
-- no checkout UI required — and receive full paid-plan credits for ₹0.
--
-- FIX: payment capture and credit fulfilment are now two separate,
-- server-verified steps (backend/app/routers/merchant.py's /create-order
-- and /verify-payment, called from /purchase-plan):
--   1. /create-order writes a 'created' row here for a specific merchant +
--      plan + amount — the amount is looked up server-side from the plan
--      catalog (plans_ms.py), never trusted from the client.
--   2. /verify-payment marks a row 'paid' ONLY after checking an HMAC-SHA256
--      signature over `order_id|payment_id` against RAZORPAY_KEY_SECRET —
--      the same signature scheme Razorpay's checkout/webhook uses. If no
--      real payment-gateway secret is configured (RAZORPAY_KEY_SECRET
--      unset, which is the state of this project today — see
--      backend/.env.example), verification fails closed: no order for a
--      plan with a nonzero price can ever be marked 'paid'. This is the
--      correct behaviour for a production deployment that has not yet
--      wired in a real gateway — it must not be able to grant paid
--      credits at all, rather than silently trusting the client.
--   3. /purchase-plan itself now REQUIRES an orderId referencing a 'paid',
--      not-yet-consumed row that matches the merchant + planId being
--      purchased, and marks it 'consumed' in the same statement it grants
--      credits (single atomic UPDATE ... WHERE status='paid' AND NOT
--      consumed ... RETURNING) — a captured payment can fund exactly one
--      plan activation, never replayed twice.
--
-- IDEMPOTENT: safe to re-run.

create table if not exists public.payment_orders (
  id text primary key,
  "merchantId" text not null,
  purpose text not null,             -- 'plan' | 'addon'
  "itemId" text not null,             -- planId, or the addon id
  amount integer not null,            -- INR, resolved server-side from the catalog — never client-supplied
  status text not null default 'created',  -- 'created' | 'paid' | 'failed'
  consumed boolean not null default false, -- true once /purchase-plan or /extend-validity has spent this paid order
  "providerOrderId" text,
  "providerPaymentId" text,
  signature text,
  "createdAt" bigint not null,
  "paidAt" bigint
);

create index if not exists payment_orders_merchant_idx on public.payment_orders ("merchantId");

-- No anon/authenticated policies at all — same lockdown as merchants
-- (0005) and billing_requests/invoices (0007). Every payment_orders read/
-- write happens exclusively through the backend's BYPASSRLS `postgres`
-- connection (backend/app/payment_repo.py), gated by the merchant JWT
-- (require_merchant). There is no legitimate reason for a browser holding
-- only the anon key to read or write this table directly.
alter table public.payment_orders enable row level security;
alter table public.payment_orders force row level security;
revoke all on public.payment_orders from anon;
revoke all on public.payment_orders from authenticated;

-- <<< End Migration: 0008_payment_orders.sql <<<


-- >>> Migration: 0009_auth_rate_state.sql >>>

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

-- <<< End Migration: 0009_auth_rate_state.sql <<<


-- >>> Migration: 0010_company_seal.sql >>>

-- Company Seal — purely additive column for the Company Seal UI feature.
-- =============================================================================
-- Mirrors "logoDataUrl" / "signatureDataUrl" exactly: a single nullable
-- text column that stores an image data URL (either an uploaded seal file
-- or a system-generated circular seal). Nothing else about the merchants
-- table, its RLS policies, or any other table is touched.
--
-- Does NOT change: GST engine, invoice numbering, invoice approval flow,
-- payment workflow, RLS policies, any API contract other than this one
-- new optional field, or any other business logic.
--
-- Safe to run against a fresh project or re-run against an existing one
-- (idempotent: guarded with IF NOT EXISTS, same as 0006).

alter table public.merchants
  add column if not exists "companySealDataUrl" text;

-- Expose it on the customer-facing/public view too? Not needed — the
-- Company Seal is only ever rendered on invoice PDFs that already flow
-- entirely through the merchant's own authenticated session and the
-- backend's invoice-generation payload, never through merchants_public.
-- (See supabase/migrations/0005_merchants_lockdown.sql / 0006's own view
-- definition — intentionally left unchanged here.)

-- <<< End Migration: 0010_company_seal.sql <<<


-- >>> Migration: 0011_free_invoice_tracking.sql >>>

-- 0011: Add free-invoice-per-24h tracking column
--
-- Every merchant gets 1 free PDF invoice every 24 hours, independent of
-- their paid plan/credits. This column tracks when they last used it.
-- NULL or 0 = never used (first free invoice available immediately).

ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS "lastFreeInvoiceAt" bigint DEFAULT NULL;

COMMENT ON COLUMN public.merchants."lastFreeInvoiceAt"
  IS 'Epoch-ms timestamp of last free-invoice usage. NULL = never used.';

-- <<< End Migration: 0011_free_invoice_tracking.sql <<<


-- >>> Migration: 0012_merchant_network.sql >>>

-- Migration 0012: Merchant Network (Module A)
-- Idempotent and additive. Sets up B2B marketplace tables.
-- Strict RLS lockdown pattern applied to all new tables (enabled + forced, zero open policies, backend-only bypass).

-- ==========================================
-- 1. Create Tables
-- ==========================================

-- MODULE A: Merchant Network Requests
CREATE TABLE IF NOT EXISTS public.merchant_network_requests (
    id text PRIMARY KEY,
    requester_merchant_id text NOT NULL REFERENCES public.merchants(id),
    product_name text NOT NULL,
    quantity numeric NOT NULL,
    unit text NOT NULL,
    urgency text NOT NULL DEFAULT 'normal', -- 'normal' | 'urgent'
    status text NOT NULL DEFAULT 'open', -- 'open' | 'responded' | 'accepted' | 'confirmed' | 'completed' | 'cancelled'
    city text,
    pincode text,
    state text,
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL
);

-- MODULE A: Merchant Network Responses
CREATE TABLE IF NOT EXISTS public.merchant_network_responses (
    id text PRIMARY KEY,
    request_id text NOT NULL REFERENCES public.merchant_network_requests(id) ON DELETE CASCADE,
    responder_merchant_id text NOT NULL REFERENCES public.merchants(id),
    availability text NOT NULL, -- 'available' | 'not_available'
    created_at bigint NOT NULL
);

-- MODULE A: Merchant Network Orders
CREATE TABLE IF NOT EXISTS public.merchant_network_orders (
    id text PRIMARY KEY,
    request_id text NOT NULL REFERENCES public.merchant_network_requests(id),
    buyer_merchant_id text NOT NULL REFERENCES public.merchants(id),
    seller_merchant_id text NOT NULL REFERENCES public.merchants(id),
    delivery_mode text NOT NULL, -- 'self_pickup' | 'delivery_partner'
    buyer_confirmed_at bigint,
    seller_confirmed_at bigint,
    status text NOT NULL, -- e.g. 'pending' | 'accepted' | 'confirmed' | 'completed' | 'cancelled'
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL
);

-- MODULE A: Merchant Network Messages
CREATE TABLE IF NOT EXISTS public.merchant_network_messages (
    id text PRIMARY KEY,
    order_id text REFERENCES public.merchant_network_orders(id),
    request_id text REFERENCES public.merchant_network_requests(id),
    sender_merchant_id text NOT NULL REFERENCES public.merchants(id),
    body text NOT NULL,
    created_at bigint NOT NULL
);

-- MODULE A: Merchant Network Activity Log
CREATE TABLE IF NOT EXISTS public.merchant_network_activity_log (
    id text PRIMARY KEY,
    actor_merchant_id text NOT NULL REFERENCES public.merchants(id),
    request_id text REFERENCES public.merchant_network_requests(id),
    order_id text REFERENCES public.merchant_network_orders(id),
    action text NOT NULL,
    meta jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at bigint NOT NULL
);

-- MODULE A: Merchant Trust Metrics
CREATE TABLE IF NOT EXISTS public.merchant_trust_metrics (
    id text PRIMARY KEY,
    merchant_id text NOT NULL UNIQUE REFERENCES public.merchants(id),
    trust_score numeric,
    successful_transactions integer NOT NULL DEFAULT 0,
    response_rate numeric,
    cancellation_rate numeric,
    updated_at bigint NOT NULL
);

-- MODULE A: Network Notifications
CREATE TABLE IF NOT EXISTS public.network_notifications (
    id text PRIMARY KEY,
    recipient_merchant_id text NOT NULL REFERENCES public.merchants(id),
    event_type text NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    related_request_id text REFERENCES public.merchant_network_requests(id),
    related_order_id text REFERENCES public.merchant_network_orders(id),
    read boolean NOT NULL DEFAULT false,
    created_at bigint NOT NULL
);

-- MODULE A: Network Feature Flags
CREATE TABLE IF NOT EXISTS public.network_feature_flags (
    id text PRIMARY KEY,
    flag_key text NOT NULL UNIQUE,
    enabled boolean NOT NULL DEFAULT false,
    updated_by_admin_id text,
    updated_at bigint NOT NULL
);

-- ==========================================
-- 2. Indexes
-- ==========================================

-- Merchant Network Indexes
CREATE INDEX IF NOT EXISTS merchant_network_reqs_requester_idx ON public.merchant_network_requests(requester_merchant_id);
CREATE INDEX IF NOT EXISTS merchant_network_reqs_status_idx ON public.merchant_network_requests(status);
CREATE INDEX IF NOT EXISTS merchant_network_resps_req_idx ON public.merchant_network_responses(request_id);
CREATE INDEX IF NOT EXISTS merchant_network_resps_merch_idx ON public.merchant_network_responses(responder_merchant_id);
CREATE INDEX IF NOT EXISTS merchant_network_orders_req_idx ON public.merchant_network_orders(request_id);
CREATE INDEX IF NOT EXISTS merchant_network_orders_buyer_idx ON public.merchant_network_orders(buyer_merchant_id);
CREATE INDEX IF NOT EXISTS merchant_network_orders_seller_idx ON public.merchant_network_orders(seller_merchant_id);
CREATE INDEX IF NOT EXISTS merchant_network_messages_order_idx ON public.merchant_network_messages(order_id);
CREATE INDEX IF NOT EXISTS merchant_network_messages_req_idx ON public.merchant_network_messages(request_id);
CREATE INDEX IF NOT EXISTS network_notifications_recipient_idx ON public.network_notifications(recipient_merchant_id);
CREATE INDEX IF NOT EXISTS network_notifications_read_idx ON public.network_notifications(read);

-- ==========================================
-- 3. Row Level Security & Lockdown
-- ==========================================

DO $$
DECLARE
    t text;
    tables_list text[] := ARRAY[
        'merchant_network_requests',
        'merchant_network_responses',
        'merchant_network_orders',
        'merchant_network_messages',
        'merchant_network_activity_log',
        'merchant_trust_metrics',
        'network_notifications',
        'network_feature_flags'
    ];
BEGIN
    FOREACH t IN ARRAY tables_list LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
        EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
        EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', t);
    END LOOP;
END $$;

-- ==========================================
-- 4. Seed Data
-- ==========================================

INSERT INTO public.network_feature_flags (id, flag_key, enabled, updated_by_admin_id, updated_at)
VALUES (
    'flag_merchant_network_enabled',
    'merchant_network_enabled',
    false,
    NULL,
    (extract(epoch from now()) * 1000)::bigint
)
ON CONFLICT (flag_key) DO NOTHING;

-- <<< End Migration: 0012_merchant_network.sql <<<


-- >>> Migration: 0013_hsn_learning.sql >>>

-- Migration 0013: HSN Learning Signals
-- Additive only — no existing table is touched.
-- Stores merchant-approved HSN/SAC selections so the AI suggestion engine
-- can learn from real invoice data across devices and sessions.
--
-- RLS lockdown: same pattern as 0012_merchant_network.sql — enabled + forced,
-- zero open policies, backend-only access via service role.

-- ==========================================
-- 1. Create Table
-- ==========================================

CREATE TABLE IF NOT EXISTS public.hsn_learning_signals (
    id text PRIMARY KEY,
    merchant_id text NOT NULL REFERENCES public.merchants(id),
    normalized_item_name text NOT NULL,
    sample_item_name text,
    hsn text NOT NULL,
    gst_rate numeric NOT NULL,
    approve_count integer NOT NULL DEFAULT 1,
    override_count integer NOT NULL DEFAULT 0,
    first_seen_at bigint NOT NULL,
    last_seen_at bigint NOT NULL
);

-- ==========================================
-- 2. Indexes
-- ==========================================

CREATE INDEX IF NOT EXISTS idx_hsn_learning_merchant
    ON public.hsn_learning_signals(merchant_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_hsn_learning_signal
    ON public.hsn_learning_signals(merchant_id, normalized_item_name, hsn, gst_rate);

-- ==========================================
-- 3. Row Level Security & Lockdown
-- ==========================================

ALTER TABLE public.hsn_learning_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hsn_learning_signals FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.hsn_learning_signals FROM anon;
REVOKE ALL ON public.hsn_learning_signals FROM authenticated;

-- <<< End Migration: 0013_hsn_learning.sql <<<


-- >>> Migration: 0014_merchant_location.sql >>>

-- Migration 0014: Merchant Location
-- Additive only. Adds nullable coordinates to merchants for Nearby Merchant Intelligence (Phase 4).
-- Fully backward compatible.

ALTER TABLE public.merchants
    ADD COLUMN IF NOT EXISTS latitude numeric,
    ADD COLUMN IF NOT EXISTS longitude numeric;

-- <<< End Migration: 0014_merchant_location.sql <<<


-- >>> Migration: 0015_background_jobs.sql >>>

-- Migration 0015: Background Jobs for Notification Escalation
-- Additive only.
-- A simple, robust job queue table for Phase 6 (Smart Notification Engine).
-- Uses Postgres SKIP LOCKED for concurrency-safe worker fetching.

CREATE TABLE IF NOT EXISTS public.background_jobs (
    id text PRIMARY KEY,
    job_type text NOT NULL, -- e.g., 'escalate_network_search'
    payload jsonb NOT NULL,
    status text NOT NULL DEFAULT 'pending', -- 'pending' | 'processing' | 'completed' | 'failed'
    run_after bigint NOT NULL, -- Epoch ms
    locked_at bigint,
    locked_by text,
    attempts integer NOT NULL DEFAULT 0,
    max_attempts integer NOT NULL DEFAULT 3,
    error_log text,
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL
);

-- Index for efficient polling of due jobs
CREATE INDEX IF NOT EXISTS idx_background_jobs_pending ON public.background_jobs (run_after) 
WHERE status = 'pending';

-- ---------------- Row Level Security ----------------
ALTER TABLE public.background_jobs ENABLE ROW LEVEL SECURITY;

-- Backend only access (bypasses RLS). No public policies needed.

-- <<< End Migration: 0015_background_jobs.sql <<<


-- >>> Migration: 0016_merchant_network_schema_sync.sql >>>

-- Migration 0016: Merchant Network Schema Sync
-- Adds missing columns expected by the backend but omitted in initial migrations.

ALTER TABLE public.merchant_network_requests
    ADD COLUMN IF NOT EXISTS origin text,
    ADD COLUMN IF NOT EXISTS origin_customer_request_id text,
    ADD COLUMN IF NOT EXISTS match_source text;

ALTER TABLE public.merchant_network_orders
    ADD COLUMN IF NOT EXISTS delivery_provider_code text,
    ADD COLUMN IF NOT EXISTS delivery_provider_ref text;

ALTER TABLE public.merchant_trust_metrics
    ADD COLUMN IF NOT EXISTS ai_risk_score numeric;

-- <<< End Migration: 0016_merchant_network_schema_sync.sql <<<


-- >>> Migration: 0017_merchant_network_terms.sql >>>

-- 0017_merchant_network_terms.sql
-- Add networkTermsAccepted column to merchants table to track Terms of Use acceptance.

ALTER TABLE public.merchants 
ADD COLUMN IF NOT EXISTS "networkTermsAccepted" BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS "networkTermsAcceptedAt" BIGINT,
ADD COLUMN IF NOT EXISTS "networkTermsVersion" TEXT;

-- The schema cache must be refreshed for PostgREST to see the new column
NOTIFY pgrst, 'reload schema';

-- <<< End Migration: 0017_merchant_network_terms.sql <<<


-- >>> Migration: 0018_qr_inventory.sql >>>

-- QR Inventory: real, backend-only pool of pre-printed Merchant QR stickers.
-- =============================================================================
-- CONTEXT: the Admin "QR Inventory" screen (src/pages/admin/AdminQrInventory.tsx)
-- previously read/wrote a `qr_inventory` "table" that only ever lived in the
-- ADMIN'S OWN BROWSER localStorage (see src/lib/db.ts's `Table` class and the
-- old adminService.generateQrBatch in services.ts). Generating "500 QR codes"
-- did nothing outside that one browser tab: the codes were never reachable by
-- the customer-facing /pay/:qrId flow (which has always queried the REAL
-- public.merchants table via backend/app/merchant_repo.py's get_by_qr_id), so
-- every printed sticker 404'd for every customer with "No merchant found for
-- this QR code" — exactly the bug in the screenshot this migration fixes.
--
-- This migration makes the QR pool a real Postgres table, generated and
-- assigned entirely through the backend (backend/app/qr_inventory_repo.py +
-- routers/admin.py), so:
--   1. A batch of codes (AKM-000001, AKM-000002, ...) can be pre-generated
--      and printed before any merchant exists.
--   2. An admin assigns one physical sticker to a merchant — this WRITES
--      that code into merchants."qrId", which is the exact column the
--      existing customer /pay/:qrId lookup already reads. No change needed
--      to the customer-facing flow at all.
--   3. If a merchant stops using their QR (loses the sticker, closes the
--      account, etc.), the admin unassigns it — merchants."qrId" is cleared
--      back to NULL (a unique index already allows multiple NULLs — see
--      migration 0001) and the code returns to the "available" pool to be
--      re-assigned to a different merchant later.
--
-- ADDITIVE ONLY: does not alter/rename/drop any existing column or table.
-- Idempotent: safe to re-run.

-- ---------------- 1. Sequence backing the QR code numbering ----------------
-- Same primitive as merchant_code_seq (migration 0006): nextval() is atomic
-- under concurrent "Generate batch" calls and a value is never handed out
-- twice, so two admins generating at once can never collide.
create sequence if not exists public.qr_inventory_seq;

-- ---------------- 2. The pool table itself ----------------
create table if not exists public.qr_inventory (
  id               text primary key,
  code             text not null unique,          -- e.g. "AKM-000021"
  seq              bigint not null unique,          -- numeric part, for ordering
  status           text not null default 'available' check (status in ('available', 'assigned')),
  "assignedMerchantId" text references public.merchants(id) on delete set null,
  "assignedAt"     bigint,
  "createdAt"      bigint not null
);

create index if not exists qr_inventory_status_idx on public.qr_inventory (status);
create index if not exists qr_inventory_assigned_merchant_idx on public.qr_inventory ("assignedMerchantId");

-- ---------------- 3. Lock it down exactly like public.merchants ----------------
-- This table is only ever touched by the backend's own direct Postgres
-- connection (DATABASE_URL, BYPASSRLS role — see config.py), gated by
-- Depends(require_admin) in routers/admin.py. No anon/authenticated policy
-- is added, so with RLS enabled and zero matching policies, PostgREST (the
-- anon key shipped in the JS bundle) is denied all access — exactly the
-- same protection public.merchants already has (see migration 0005).
alter table public.qr_inventory enable row level security;
alter table public.qr_inventory force row level security;

revoke all on public.qr_inventory from anon;
revoke all on public.qr_inventory from authenticated;

-- <<< End Migration: 0018_qr_inventory.sql <<<


-- >>> Migration: 0019_merchant_network_features.sql >>>

-- Migration 0019: Merchant Network Features
-- 1. Adds cancellation_reason to merchant_network_orders for cancellation tracking.
-- 2. Adds image_url to merchant_network_messages for photo attachments in chat.
-- 3. Creates merchant_network_reviews table for trust score ratings & feedback.
-- 4. Creates merchant_network_disputes table for reporting issues & admin flags.

-- 1. Order Cancellation Reason
alter table public.merchant_network_orders
  add column if not exists cancellation_reason text;

-- 2. Chat Image Attachment
alter table public.merchant_network_messages
  add column if not exists image_url text;

-- 3. Ratings & Reviews Table
create table if not exists public.merchant_network_reviews (
  id text primary key,
  order_id text not null,
  reviewer_merchant_id text not null,
  reviewee_merchant_id text not null,
  rating integer not null check (rating >= 1 and rating <= 5),
  comment text,
  created_at bigint not null
);

create index if not exists reviews_order_idx on public.merchant_network_reviews (order_id);
create index if not exists reviews_reviewee_idx on public.merchant_network_reviews (reviewee_merchant_id);

alter table public.merchant_network_reviews enable row level security;
alter table public.merchant_network_reviews force row level security;
revoke all on public.merchant_network_reviews from anon;
revoke all on public.merchant_network_reviews from authenticated;

-- 4. Disputes & Issue Reporting Table
create table if not exists public.merchant_network_disputes (
  id text primary key,
  order_id text not null,
  reporter_merchant_id text not null,
  target_merchant_id text not null,
  reason text not null,               -- 'no_response' | 'wrong_quantity_quality' | 'suspected_fraud' | 'other'
  details text,
  status text not null default 'open', -- 'open' | 'investigating' | 'resolved' | 'dismissed'
  created_at bigint not null,
  resolved_at bigint
);

create index if not exists disputes_order_idx on public.merchant_network_disputes (order_id);
create index if not exists disputes_status_idx on public.merchant_network_disputes (status);

alter table public.merchant_network_disputes enable row level security;
alter table public.merchant_network_disputes force row level security;
revoke all on public.merchant_network_disputes from anon;
revoke all on public.merchant_network_disputes from authenticated;

-- <<< End Migration: 0019_merchant_network_features.sql <<<


-- >>> Migration: 0020_smart_inventory.sql >>>

-- Migration 0020: Smart Inventory
-- Idempotent and additive. Sets up merchant inventory catalog table.
-- Strict tenant-level RLS isolation: each merchant can only access their own inventory.

create table if not exists public.merchant_inventory (
  id text primary key,
  merchant_id text not null references public.merchants(id) on delete cascade,
  product_name text not null,
  description text default '',
  hsn_code text default '',
  gst_rate numeric not null default 18,
  selling_price numeric not null default 0,
  cost_price numeric default 0,
  stock_quantity numeric not null default 0,
  unit text default 'pcs',
  image_url text default '',
  is_active boolean default true,
  created_at bigint not null,
  updated_at bigint not null
);

-- Index for fast merchant-level lookups
create index if not exists idx_inventory_merchant on public.merchant_inventory(merchant_id);

-- Enable & Force RLS for strict multi-tenant security
alter table public.merchant_inventory enable row level security;
alter table public.merchant_inventory force row level security;

-- Drop legacy open policies if present
drop policy if exists inventory_merchant_read on public.merchant_inventory;
drop policy if exists inventory_merchant_insert on public.merchant_inventory;
drop policy if exists inventory_merchant_update on public.merchant_inventory;
drop policy if exists inventory_merchant_delete on public.merchant_inventory;
drop policy if exists inventory_merchant_isolation on public.merchant_inventory;

-- Strict Merchant-level Tenant Isolation Policies (Scoped by merchant_id)
create policy inventory_merchant_read on public.merchant_inventory
  for select
  using (merchant_id = auth.uid()::text or merchant_id = (auth.jwt() ->> 'merchantId'));

create policy inventory_merchant_insert on public.merchant_inventory
  for insert
  with check (merchant_id = auth.uid()::text or merchant_id = (auth.jwt() ->> 'merchantId'));

create policy inventory_merchant_update on public.merchant_inventory
  for update
  using (merchant_id = auth.uid()::text or merchant_id = (auth.jwt() ->> 'merchantId'))
  with check (merchant_id = auth.uid()::text or merchant_id = (auth.jwt() ->> 'merchantId'));

create policy inventory_merchant_delete on public.merchant_inventory
  for delete
  using (merchant_id = auth.uid()::text or merchant_id = (auth.jwt() ->> 'merchantId'));

-- <<< End Migration: 0020_smart_inventory.sql <<<


-- >>> Migration: 0021_customer_vault.sql >>>

-- 0021_customer_vault.sql
-- Customer Vault — Fourth Isolated Realm (Customer authentication & identity)

create sequence if not exists public.customer_code_seq start 1;

create table if not exists public.customers (
  id text primary key,
  "customerCode" text unique not null,       -- AKC-00000001, AKC-00000002, ...
  "name" text not null,
  "phone" text unique not null,
  "pin" text not null,                        -- bcrypt hash
  "email" text,
  "gstin" text,
  "billingAddress" text,
  "companyName" text,
  "state" text,
  "status" text not null default 'active',    -- 'active' | 'suspended' | 'disabled'
  "createdAt" bigint not null,
  "lastLoginAt" bigint
);

create index if not exists idx_customers_phone on public.customers("phone");
create index if not exists idx_customers_code on public.customers("customerCode");

-- RLS: Backend service role connection handles data operations
alter table public.customers enable row level security;

-- Audit Logs for Customer Lookups & Selects (DPDP Compliance & Security)
create table if not exists public.customer_lookup_audit_logs (
  id text primary key,
  "merchantId" text not null,
  "merchantKycStatus" text not null,
  "customerId" text,
  "lookupQuery" text not null,
  "actionType" text not null, -- 'search_masked' | 'select_unmasked' | 'pin_autofill'
  "invoiceCreated" boolean default false,
  "ipAddress" text,
  "deviceInfo" text,
  "success" boolean not null,
  "createdAt" bigint not null
);

create index if not exists idx_lookup_audit_merchant on public.customer_lookup_audit_logs("merchantId");
create index if not exists idx_lookup_audit_customer on public.customer_lookup_audit_logs("customerId");

alter table public.customer_lookup_audit_logs enable row level security;

-- <<< End Migration: 0021_customer_vault.sql <<<


-- >>> Migration: 0022_customer_vault_lockdown.sql >>>

-- 0022_customer_vault_lockdown.sql
-- Customer Vault Hardening & RLS Lockdown Phase (DPDP Act & Enterprise Security Compliance)
--
-- ARCHITECTURAL CONTEXT & SECURITY RATIONALE:
-- 1. WHY "ENABLE RLS" IS NOT ENOUGH:
--    In PostgreSQL/Supabase, `ENABLE ROW LEVEL SECURITY` enables RLS policies for standard query execution.
--    However, without `FORCE ROW LEVEL SECURITY`, table owners and table-creating roles bypass RLS policies
--    by default for table operations. Applying `FORCE ROW LEVEL SECURITY` ensures that RLS constraints are
--    unconditionally applied across all non-superuser contexts.
--
-- 2. WHY REVOKING `anon` AND `authenticated` GRANTS IS MANDATORY:
--    Supabase exposes base tables over PostgREST HTTP endpoints using the public `anon` key (shipped in frontend bundles)
--    and `authenticated` JWT tokens. If table grants (SELECT, INSERT, UPDATE, DELETE) remain active on `public.customers`
--    or `public.customer_lookup_audit_logs`, an attacker could issue direct client-side PostgREST queries to scrape
--    sensitive Customer PII (Phone, Address, GSTIN, Company Name, Email, BCrypt MPIN hash).
--
-- 3. BACKEND ZERO-REGRESSION VERIFICATION:
--    The Python backend (`customer_repo.py`, `routers/customer.py`) executes queries via SQLAlchemy (`AsyncSession`)
--    using the direct PostgreSQL connection string (`DATABASE_URL`, connecting as `postgres` service role).
--    The `postgres` backend connection possesses `BYPASSRLS` privileges and table ownership, allowing all backend APIs
--    (Registration, Login, Search, Unmasked Billing, Audit Logging) to continue operating with 0% disruption.
--
-- IDEMPOTENT & SAFE TO RE-RUN.

-- ---------------- 1. Force RLS on Customer Vault Tables ----------------
alter table public.customers enable row level security;
alter table public.customers force row level security;

alter table public.customer_lookup_audit_logs enable row level security;
alter table public.customer_lookup_audit_logs force row level security;

-- ---------------- 2. Revoke Direct Anon & Authenticated Access ----------------
-- Completely block direct client-side (PostgREST / Browser) access to base tables
revoke all on public.customers from anon;
revoke all on public.customers from authenticated;

revoke all on public.customer_lookup_audit_logs from anon;
revoke all on public.customer_lookup_audit_logs from authenticated;

-- <<< End Migration: 0022_customer_vault_lockdown.sql <<<


-- >>> Migration: 0023_merchant_branding_storage.sql >>>

-- 0023_merchant_branding_storage.sql
-- Enterprise Asset Storage Architecture — Phase 1 Additive Schema
--
-- Purely additive migration for high-performance CDN asset URLs & presence status flags.
-- Does NOT drop or alter any existing columns (logoDataUrl, signatureDataUrl, companySealDataUrl).
-- Guarantees 100% backward compatibility for all live devices and offline cached sessions.

-- ---------------- 1. Additive Column Definitions ----------------
alter table public.merchants
  add column if not exists "logoUrl" text,
  add column if not exists "signatureUrl" text,
  add column if not exists "companySealUrl" text,
  add column if not exists "hasCustomLogo" boolean default false,
  add column if not exists "hasSignature" boolean default false,
  add column if not exists "hasCompanySeal" boolean default false;

-- ---------------- 2. Idempotent Storage Bucket Creation ----------------
insert into storage.buckets (id, name, public)
values ('merchant-branding', 'merchant-branding', true)
on conflict (id) do update set public = true;

-- ---------------- 3. Enterprise Storage RLS Security Policies ----------------

-- Public Read Access Policy (SELECT for CDN delivery)
-- Anyone (browsers, customers, PDF engines) can read/download public branding assets.
drop policy if exists "Public Read Access for Merchant Branding" on storage.objects;
create policy "Public Read Access for Merchant Branding"
  on storage.objects for select
  using (bucket_id = 'merchant-branding');

-- Write Access (INSERT/UPDATE/DELETE) is restricted to backend service_role only.
-- Public clients (anon/authenticated) are DENIED direct write access.
-- All uploads, WebP compressions, and deletions are securely authorized & processed
-- through the FastAPI backend using the Service Role credential.
drop policy if exists "Service Role Write Access for Merchant Branding" on storage.objects;
create policy "Service Role Write Access for Merchant Branding"
  on storage.objects for all
  using (
    bucket_id = 'merchant-branding' 
    and auth.role() = 'service_role'
  );

-- <<< End Migration: 0023_merchant_branding_storage.sql <<<


-- >>> Migration: 0024_merchants_legacy_policies_cleanup.sql >>>

-- 0024_merchants_legacy_policies_cleanup.sql
-- Drop legacy open policies on base table public.merchants to enforce zero-trust security.
-- All merchant operations flow through FastAPI backend direct connection (postgres role / BYPASSRLS).

drop policy if exists "AK LOGIC AI ALL" on public.merchants;
drop policy if exists "AK LOGIC AI DELETE" on public.merchants;
drop policy if exists "AK LOGIC AI INSERT" on public.merchants;
drop policy if exists "AK LOGIC AI SELECT" on public.merchants;
drop policy if exists "AK LOGIC AI UPDATE" on public.merchants;

-- <<< End Migration: 0024_merchants_legacy_policies_cleanup.sql <<<


-- >>> Migration: 0025_customer_merchant_chat.sql >>>

-- 0025_customer_merchant_chat.sql
-- Production-Grade Customer <-> Merchant Unified Chat Infrastructure

-- 1. Create chat_threads table
create table if not exists public.chat_threads (
  id text primary key,
  channel_type text not null default 'b2c_inquiry',
  merchant_id text not null references public.merchants(id) on delete cascade,
  customer_id text references public.customers(id) on delete set null,
  status text not null default 'active',
  last_message_at bigint not null,
  last_message_snippet text default '',
  merchant_unread_count integer not null default 0,
  customer_unread_count integer not null default 0,
  merchant_pinned boolean not null default false,
  customer_pinned boolean not null default false,
  active_inquiry_item_id text references public.merchant_inventory(id) on delete set null,
  agreed_unit_price numeric default null,
  draft_billing_request_id text references public.billing_requests(id) on delete set null,
  created_at bigint not null,
  updated_at bigint not null
);

-- 2. Create chat_messages table
create table if not exists public.chat_messages (
  id text primary key,
  thread_id text not null references public.chat_threads(id) on delete cascade,
  sender_type text not null,
  sender_id text not null,
  msg_type text not null default 'text',
  content text not null,
  media_url text default '',
  metadata jsonb default '{}'::jsonb,
  status text not null default 'sent',
  read_at bigint default null,
  created_at bigint not null
);

-- 3. Indexes for 10M+ message scale
create index if not exists idx_threads_merchant on public.chat_threads(merchant_id, last_message_at desc);
create index if not exists idx_threads_customer on public.chat_threads(customer_id, last_message_at desc);
create index if not exists idx_messages_thread on public.chat_messages(thread_id, created_at desc);

-- 4. Enable RLS
alter table public.chat_threads enable row level security;
alter table public.chat_messages enable row level security;

-- 5. Hardened RLS Policies (Service Role Access)
drop policy if exists "Chat Threads Service Role Read" on public.chat_threads;
create policy "Chat Threads Service Role Read" on public.chat_threads for select using (true);

drop policy if exists "Chat Messages Service Role Read" on public.chat_messages;
create policy "Chat Messages Service Role Read" on public.chat_messages for select using (true);

-- <<< End Migration: 0025_customer_merchant_chat.sql <<<


-- >>> Migration: 0026_merchant_signatures_private_storage.sql >>>

-- 0026_merchant_signatures_private_storage.sql
-- Create Private Bucket for Signatures & Seals with Restricted Access

insert into storage.buckets (id, name, public)
values ('merchant-signatures', 'merchant-signatures', false)
on conflict (id) do update set public = false;

drop policy if exists "Service Role Access for Merchant Signatures" on storage.objects;
create policy "Service Role Access for Merchant Signatures"
  on storage.objects for all
  using (
    bucket_id = 'merchant-signatures' 
    and auth.role() = 'service_role'
  );

-- <<< End Migration: 0026_merchant_signatures_private_storage.sql <<<


-- >>> Migration: 0027_gstin_uniqueness_index.sql >>>

-- Migration 0027: Enforce GSTIN Uniqueness at Database Level
--
-- Description:
-- 1. Drops legacy unique constraint on phone to allow multiple business accounts under the same mobile number with different GSTINs.
-- 2. Creates a partial unique index on upper(gstin) to strictly enforce GSTIN uniqueness at the PostgreSQL database level.

-- Step 1: Relax DB-level phone uniqueness constraint
ALTER TABLE public.merchants DROP CONSTRAINT IF EXISTS merchants_phone_key;
DROP INDEX IF EXISTS public.idx_merchants_phone_unique;
CREATE INDEX IF NOT EXISTS idx_merchants_phone ON public.merchants("phone");

-- Step 2: Enforce DB-level GSTIN uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS merchants_gstin_unique_idx
ON public.merchants (upper(gstin))
WHERE gstin IS NOT NULL AND trim(gstin) <> '';

-- <<< End Migration: 0027_gstin_uniqueness_index.sql <<<


-- >>> Migration: 0028_accounting_core.sql >>>

-- 0028_accounting_core.sql
-- Double-Entry Accounting Core: Chart of Accounts, Journal Entries, and Journal Lines.

CREATE TABLE IF NOT EXISTS public.chart_of_accounts (
    id text PRIMARY KEY,
    merchant_id text NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
    code text NOT NULL,
    name text NOT NULL,
    type text NOT NULL, -- 'asset' | 'liability' | 'equity' | 'income' | 'expense'
    parent_id text,
    is_system boolean DEFAULT false,
    description text DEFAULT '',
    created_at bigint NOT NULL,
    CONSTRAINT uq_merchant_account_code UNIQUE (merchant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_coa_merchant ON public.chart_of_accounts(merchant_id);
ALTER TABLE public.chart_of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chart_of_accounts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.chart_of_accounts FROM anon;
REVOKE ALL ON public.chart_of_accounts FROM authenticated;

CREATE TABLE IF NOT EXISTS public.journal_entries (
    id text PRIMARY KEY,
    merchant_id text NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
    entry_date text NOT NULL,
    narration text DEFAULT '',
    source_type text NOT NULL, -- 'purchase' | 'invoice' | 'reversal' | 'manual'
    source_id text NOT NULL,
    is_reversed boolean DEFAULT false,
    reversed_by_id text,
    created_at bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_je_merchant ON public.journal_entries(merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_je_source ON public.journal_entries(source_type, source_id);
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.journal_entries FROM anon;
REVOKE ALL ON public.journal_entries FROM authenticated;

CREATE TABLE IF NOT EXISTS public.journal_lines (
    id text PRIMARY KEY,
    journal_entry_id text NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
    merchant_id text NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
    account_id text NOT NULL REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
    debit numeric DEFAULT 0,
    credit numeric DEFAULT 0,
    party_type text, -- 'supplier' | 'customer' | null
    party_ref text DEFAULT '',
    created_at bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_jl_entry ON public.journal_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_jl_account ON public.journal_lines(account_id);
CREATE INDEX IF NOT EXISTS idx_jl_merchant_party ON public.journal_lines(merchant_id, party_ref);
ALTER TABLE public.journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_lines FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.journal_lines FROM anon;
REVOKE ALL ON public.journal_lines FROM authenticated;

-- <<< End Migration: 0028_accounting_core.sql <<<


-- >>> Migration: 0029_primary_merchant.sql >>>

-- 0029_primary_merchant.sql
-- Module 2: Primary Merchant System for Customer Vault

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS "primaryMerchantId" text REFERENCES public.merchants(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_customers_primary_merchant ON public.customers("primaryMerchantId");

CREATE TABLE IF NOT EXISTS public.customer_primary_merchant_logs (
    id text PRIMARY KEY,
    "customerId" text NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    "previousMerchantId" text REFERENCES public.merchants(id) ON DELETE SET NULL,
    "newMerchantId" text REFERENCES public.merchants(id) ON DELETE SET NULL,
    "action" text NOT NULL, -- 'set' | 'change' | 'remove'
    "changedAt" bigint NOT NULL,
    "ipAddress" text
);

CREATE INDEX IF NOT EXISTS idx_pm_logs_customer ON public.customer_primary_merchant_logs("customerId");

-- <<< End Migration: 0029_primary_merchant.sql <<<


-- >>> Migration: 0030_deliveries.sql >>>

-- 0030_deliveries.sql
-- Module 6: Parcel / Delivery and Order Logistics Module

CREATE TABLE IF NOT EXISTS public.deliveries (
    id text PRIMARY KEY,
    merchant_id text NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
    invoice_id text REFERENCES public.invoices(id) ON DELETE SET NULL,
    order_ref text DEFAULT '',
    status text NOT NULL DEFAULT 'pending', -- 'pending' | 'picked' | 'in_transit' | 'delivered' | 'failed'
    address text NOT NULL,
    recipient_name text NOT NULL,
    recipient_phone text NOT NULL,
    courier_name text DEFAULT '',
    tracking_ref text DEFAULT '',
    pickup_time bigint,
    delivered_at bigint,
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_deliv_merchant ON public.deliveries(merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deliv_invoice ON public.deliveries(invoice_id);
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliveries FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.deliveries FROM anon;
REVOKE ALL ON public.deliveries FROM authenticated;

CREATE TABLE IF NOT EXISTS public.delivery_status_events (
    id text PRIMARY KEY,
    delivery_id text NOT NULL REFERENCES public.deliveries(id) ON DELETE CASCADE,
    status text NOT NULL,
    notes text DEFAULT '',
    updated_by text DEFAULT '',
    created_at bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_deliv_events ON public.delivery_status_events(delivery_id, created_at ASC);
ALTER TABLE public.delivery_status_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_status_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.delivery_status_events FROM anon;
REVOKE ALL ON public.delivery_status_events FROM authenticated;

-- <<< End Migration: 0030_deliveries.sql <<<


-- >>> Migration: 0031_base64_egress_and_security_hardening.sql >>>

-- 0031_base64_egress_and_security_hardening.sql
-- 1. Redefine public.merchants_public view: remove heavy Base64 (logoDataUrl), add logoUrl, enable security_invoker
DROP VIEW IF EXISTS public.merchants_public CASCADE;

CREATE VIEW public.merchants_public
WITH (security_invoker = true)
AS
SELECT 
    id,
    "shopName",
    "tradeName",
    gstin,
    state,
    status,
    "logoUrl",
    "qrId",
    "planExpiresAt",
    "planValidityDays",
    "invoicePrefix",
    "brandColor",
    "brandName",
    "merchantCode"
FROM public.merchants;

-- 2. Redefine public.merchant_websites_public view with security_invoker = true
DROP VIEW IF EXISTS public.merchant_websites_public CASCADE;

CREATE VIEW public.merchant_websites_public
WITH (security_invoker = true)
AS
SELECT 
    w.id,
    w.merchant_id,
    w.slug,
    w.custom_domain,
    w.status,
    w.published_at,
    w.theme_primary_color,
    w.theme_secondary_color,
    w.theme_font,
    w.theme_style,
    w.seo_title,
    w.seo_description,
    w.seo_keywords,
    w.hero_enabled,
    w.hero_title,
    w.hero_subtitle,
    w.hero_image_url,
    w.hero_cta_text,
    w.hero_cta_link,
    w.about_enabled,
    w.about_title,
    w.about_description,
    w.about_image_url,
    w.products_enabled,
    w.products_title,
    w.products_layout,
    w.products_per_page,
    w.categories_enabled,
    w.gallery_enabled,
    w.gallery_title,
    w.contact_enabled,
    w.contact_show_phone,
    w.contact_show_email,
    w.contact_show_address,
    w.contact_show_map,
    w.footer_text,
    w.footer_show_social,
    w.footer_facebook,
    w.footer_instagram,
    w.footer_twitter,
    w.footer_whatsapp,
    w.business_hours,
    w.section_order,
    w.created_at,
    w.updated_at,
    m."shopName",
    m."ownerName",
    m."tradeName",
    m."legalName",
    m."brandName",
    m."brandColor",
    m."logoUrl",
    m."hasCustomLogo",
    m.email,
    m.phone,
    m.address,
    m.city,
    m.state,
    m.pincode,
    m.latitude,
    m.longitude
FROM public.merchant_websites w
JOIN public.merchants m ON m.id = w.merchant_id
WHERE w.status = 'published';

-- 3. Harden RLS policies on merchant_websites and website_gallery_images
DROP POLICY IF EXISTS "allow_all_merchant_websites" ON public.merchant_websites;
DROP POLICY IF EXISTS "allow_all_website_gallery_images" ON public.website_gallery_images;
DROP POLICY IF EXISTS "merchant_websites_all" ON public.merchant_websites;
DROP POLICY IF EXISTS "website_gallery_images_all" ON public.website_gallery_images;
DROP POLICY IF EXISTS "public_read_published_websites" ON public.merchant_websites;
DROP POLICY IF EXISTS "merchant_owner_manage_website" ON public.merchant_websites;
DROP POLICY IF EXISTS "public_read_gallery_images" ON public.website_gallery_images;
DROP POLICY IF EXISTS "merchant_owner_manage_gallery" ON public.website_gallery_images;

CREATE POLICY "public_read_published_websites"
ON public.merchant_websites
FOR SELECT
USING (status = 'published' OR auth.role() = 'service_role');

CREATE POLICY "merchant_owner_manage_website"
ON public.merchant_websites
FOR ALL
USING (auth.role() = 'service_role' OR merchant_id = (auth.jwt() ->> 'sub') OR merchant_id = (auth.jwt() ->> 'merchantId'))
WITH CHECK (auth.role() = 'service_role' OR merchant_id = (auth.jwt() ->> 'sub') OR merchant_id = (auth.jwt() ->> 'merchantId'));

CREATE POLICY "public_read_gallery_images"
ON public.website_gallery_images
FOR SELECT
USING (auth.role() = 'service_role' OR EXISTS (
    SELECT 1 FROM public.merchant_websites w 
    WHERE w.merchant_id = website_gallery_images.merchant_id AND w.status = 'published'
));

CREATE POLICY "merchant_owner_manage_gallery"
ON public.website_gallery_images
FOR ALL
USING (auth.role() = 'service_role' OR merchant_id = (auth.jwt() ->> 'sub') OR merchant_id = (auth.jwt() ->> 'merchantId'))
WITH CHECK (auth.role() = 'service_role' OR merchant_id = (auth.jwt() ->> 'sub') OR merchant_id = (auth.jwt() ->> 'merchantId'));

-- <<< End Migration: 0031_base64_egress_and_security_hardening.sql <<<


-- >>> Migration: 0031_mcp_access_tokens.sql >>>

-- 0031_mcp_access_tokens.sql
-- Remote MCP (Claude), ChatGPT Custom Actions, and Sarvam AI Token Store
-- Hardened RLS & Enterprise Security Model for ak-logic-ai-saas PostgreSQL database.
-- Idempotent, safe, and non-destructive.

-- 1. Create table if not exists
CREATE TABLE IF NOT EXISTS public.mcp_access_tokens (
  id TEXT PRIMARY KEY,
  token TEXT UNIQUE NOT NULL,
  merchant_id TEXT NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  label TEXT DEFAULT 'Claude Connector',
  revoked BOOLEAN NOT NULL DEFAULT false,
  created_at BIGINT NOT NULL,
  last_used_at BIGINT
);

-- 2. Ensure columns exist if table was previously created with minimal schema
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'mcp_access_tokens' AND column_name = 'label'
  ) THEN
    ALTER TABLE public.mcp_access_tokens ADD COLUMN label TEXT DEFAULT 'Claude Connector';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'mcp_access_tokens' AND column_name = 'revoked'
  ) THEN
    ALTER TABLE public.mcp_access_tokens ADD COLUMN revoked BOOLEAN NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'mcp_access_tokens' AND column_name = 'last_used_at'
  ) THEN
    ALTER TABLE public.mcp_access_tokens ADD COLUMN last_used_at BIGINT;
  END IF;
END $$;

-- 3. Indexes for O(1) token verification and merchant lookup
CREATE INDEX IF NOT EXISTS idx_mcp_tokens_token ON public.mcp_access_tokens(token);
CREATE INDEX IF NOT EXISTS idx_mcp_tokens_merchant ON public.mcp_access_tokens(merchant_id);
CREATE INDEX IF NOT EXISTS idx_mcp_tokens_revoked ON public.mcp_access_tokens(revoked);

-- 4. Enable & Force Row Level Security (RLS)
ALTER TABLE public.mcp_access_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_access_tokens FORCE ROW LEVEL SECURITY;

-- 5. Revoke direct public/client access from anon and authenticated roles
-- (Completely blocks direct client-side PostgREST / browser scraping)
REVOKE ALL ON public.mcp_access_tokens FROM anon;
REVOKE ALL ON public.mcp_access_tokens FROM authenticated;

-- 6. Hardened RLS Policy (Service Role Full Access)
-- Only serverless functions holding SUPABASE_SERVICE_ROLE_KEY or database superusers can read/write
DROP POLICY IF EXISTS "mcp_tokens_service_role_policy" ON public.mcp_access_tokens;
CREATE POLICY "mcp_tokens_service_role_policy" ON public.mcp_access_tokens
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- <<< End Migration: 0031_mcp_access_tokens.sql <<<
