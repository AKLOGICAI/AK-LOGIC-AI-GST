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