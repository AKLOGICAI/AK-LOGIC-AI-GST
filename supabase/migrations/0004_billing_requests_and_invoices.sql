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
