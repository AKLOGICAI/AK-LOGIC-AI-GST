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
