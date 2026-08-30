-- 0024_merchants_legacy_policies_cleanup.sql
-- Drop legacy open policies on base table public.merchants to enforce zero-trust security.
-- All merchant operations flow through FastAPI backend direct connection (postgres role / BYPASSRLS).

drop policy if exists "AK LOGIC AI ALL" on public.merchants;
drop policy if exists "AK LOGIC AI DELETE" on public.merchants;
drop policy if exists "AK LOGIC AI INSERT" on public.merchants;
drop policy if exists "AK LOGIC AI SELECT" on public.merchants;
drop policy if exists "AK LOGIC AI UPDATE" on public.merchants;
