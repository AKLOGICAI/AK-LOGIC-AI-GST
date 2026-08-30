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
