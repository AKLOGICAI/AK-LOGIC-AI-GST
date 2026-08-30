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

