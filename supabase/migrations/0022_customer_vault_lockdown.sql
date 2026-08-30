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
