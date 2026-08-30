# Phase 2 — RLS Lockdown & Merchant-Code Fixes

This is the follow-up to `SECURITY_FIX_SUMMARY.md`. Phase 1 added a safe
`merchants_public` view but deliberately left the `merchants` base table's
`using (true)` / `with check (true)` RLS policies in place, because at
that point nothing else in the app could write to `merchants` without
them. Phase 2 builds the real write path and then drops those policies.

## 1. What was actually broken

**A. RLS — the audit's "single highest-risk finding".**
Every merchant read/write went straight from the browser to Supabase
using the public anon key (which ships inside the JS bundle by design),
against a table with `using (true)` on every operation. Anyone holding
the anon key could read or overwrite **every** merchant's MPIN digest,
bank account number, IFSC, PAN, GSTIN, UPI ID, PDF credits, and plan
status — and there was no admin-auth check behind admin actions either,
since the admin console also wrote to this same open table.

**B. A second, independent bug found while fixing (A).**
`src/lib/db.ts` deliberately keeps `merchants` as a local
`Table` (localStorage), separate from the `RemoteTable`s used for
`billing_requests`/`invoices`. That's fine for the local *cache*. The
problem: `adminService`'s methods (`setStatus`, `setKyc`, `adjustCredits`,
`grantValidity`, `setPlan`, `resetExpiry`, `setBranding`,
`manualRecharge`, `refund`) and `subscriptionService`'s methods
(`purchasePlan`, `extendValidity`, `consumeCredit`) wrote **only** to that
local cache — never to Supabase. An admin suspending a merchant, or a
merchant buying a plan, had no durable effect beyond the browser tab that
clicked the button. The admin console's merchant list also had no "fetch
all merchants" call anywhere, so it only ever showed merchants who had
registered/logged in on that same browser.

**C. MPIN hashing was done client-side** (`src/lib/hash.ts`, salted
SHA-256) and compared client-side. `hash.ts` itself said as much: *"Once
backend MPIN verification exists, this client-side digest must not be
trusted."*

## 2. What changed

- **`backend/app/routers/merchant.py`** (new) — register / login / `GET`+
  `PATCH /me` / change-mpin / purchase-plan / extend-validity /
  consume-credit, all JWT-authenticated (`require_merchant`). MPIN is
  hashed with bcrypt server-side. Login has a real, server-side lockout
  (5 attempts → 15 min lock) — the client-side one in `MerchantLogin.tsx`
  is now just a UX nicety, not the actual boundary.
- **`backend/app/routers/admin.py`** — added `GET /merchants` (list) and
  `PATCH /merchants/{id}` (patch), both behind `require_admin`, with a
  server-side field allowlist (`ADMIN_EDITABLE_FIELDS` in
  `merchant_repo.py`) so a patch can never touch `id`/`phone`/`mpin`.
- **`backend/app/merchant_repo.py`** (new) — the only code that talks to
  `public.merchants`, over the backend's own direct Postgres connection
  (`DATABASE_URL`), which bypasses RLS entirely (see §3). Explicit column
  allowlists for what a merchant vs. an admin may write.
- **`supabase/migrations/0005_merchants_lockdown.sql`** (new) — drops the
  open anon policies, enables+forces RLS with no replacement policy (so
  anon/authenticated get nothing), and recreates `merchants_public` with
  the exact column set the frontend already expected.
- **Frontend (`src/lib/services.ts`, `store.ts`, `apiClient.ts` (new))** —
  `merchantService.register/update/verifyMpinRemote`,
  `subscriptionService.*`, and `adminService.*` now call the backend
  instead of Supabase/local-cache-only. `adminService.loadAll()` (new) is
  called once from `AdminDashboard.tsx` so the console actually sees real
  data. `src/lib/hash.ts` is deleted — nothing hashes an MPIN client-side
  anymore. Old records are upgraded from SHA-256 to bcrypt transparently
  on their next successful login (no forced reset).
- **Invoice credit deduction** (`invoiceService.approve`) now happens
  **before** invoice creation, via the atomic backend endpoint, instead of
  after — this is the actual spending gate now; the local-cache check
  that existed before is only a fast pre-check.

## 3. Before you deploy: one required config change

`backend/app/config.py`'s `database_url` **must** point at your Supabase
project's **direct** Postgres connection using the `postgres` role — not
the pgbouncer/anon/authenticated roles:

```
DATABASE_URL=postgresql+asyncpg://postgres:<password>@<project-ref>.supabase.co:5432/postgres
```

(Supabase dashboard → Project Settings → Database → Connection string →
URI.) That role has `BYPASSRLS`, which is what lets the backend keep
reading/writing `merchants` after migration 0005 denies everyone else.
Using the pooled/anon connection here will make every merchant/admin
endpoint fail with a permission error. See `backend/.env.example`.

Also set `VITE_API_BASE` in the frontend `.env` — every merchant/admin
write now genuinely requires the backend to be reachable (see
`src/lib/apiClient.ts`).

## 4. Migration order

Run `0001` → `0002` → `0003` → `0004` → `0005`, in that order, exactly
once each (Supabase's migration tooling tracks this). All five were
tested together against a clean local Postgres 16 instance in this
session, plus the full merchant/admin API surface against a live backend
(register, duplicate-phone rejection, login, wrong-MPIN lockout,
legacy-SHA256-to-bcrypt upgrade, self-service PATCH field allowlisting,
admin list/patch, cross-realm token rejection, plan purchase, validity
extension, and a 10-way concurrent credit-consumption race test that
landed on exactly 0 remaining credits, never negative).

**Found and fixed along the way:** `backend/requirements.txt` pinned
`passlib[bcrypt]==1.7.4` without pinning `bcrypt` itself. `pip install`
pulls bcrypt 5.0, which is incompatible with passlib 1.7.4's backend
self-test and made **every** register/login call fail with a 500. Now
pinned to `bcrypt==4.0.1`.

## 5. Deliberately left out of scope

- **`billing_requests` / `invoices` RLS** (migration `0004`) is unchanged
  — SELECT/INSERT remain open to the anon key. Customers have no login at
  all in this app, so an anonymous, unguessable-id-based read/write is
  the only way the QR → bill → status-check flow works without a much
  bigger redesign (e.g. Supabase Auth end-to-end). This is the same
  trade-off already documented inline in `0004`'s own comments. If you
  want this tightened further, it needs the same backend-proxy treatment
  as merchants — a bigger job, deliberately not bundled into this pass.
- **`subscriptions` / `recharge_history` / `notifications` / `contacts` /
  `support_tickets` / `admin_audit_logs` / `login_activity`** stay as
  local-only browser storage (`src/lib/db.ts`'s `Table`, not
  `RemoteTable`) — there's no Supabase table for any of them (no
  migration ever created one). That's a existing, deliberate part of the
  app's design for this data, not a gap this pass introduced.
