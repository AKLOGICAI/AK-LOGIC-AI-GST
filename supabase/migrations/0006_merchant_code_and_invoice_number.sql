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
