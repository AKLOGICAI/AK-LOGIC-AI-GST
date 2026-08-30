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
