-- Payment orders: closes the "activate a paid plan without paying" gap.
--
-- ROOT CAUSE: backend/app/routers/merchant.py's POST /purchase-plan used
-- to grant pdfCredits/planExpiresAt to whichever merchant held a valid
-- JWT and named a planId — there was no check anywhere, client or server,
-- that money had actually changed hands. src/lib/payments.ts's "provider"
-- abstraction looked like a real payment gate but ACTIVE_PROVIDER_ID was
-- 'mock', whose `checkout()` always resolves `status: 'captured'` and
-- whose `verify()` always returns `true` — i.e. purely a client-side
-- placeholder. A merchant (or anyone with a merchant JWT, obtained via
-- the app's own free registration) could call /purchase-plan directly —
-- no checkout UI required — and receive full paid-plan credits for ₹0.
--
-- FIX: payment capture and credit fulfilment are now two separate,
-- server-verified steps (backend/app/routers/merchant.py's /create-order
-- and /verify-payment, called from /purchase-plan):
--   1. /create-order writes a 'created' row here for a specific merchant +
--      plan + amount — the amount is looked up server-side from the plan
--      catalog (plans_ms.py), never trusted from the client.
--   2. /verify-payment marks a row 'paid' ONLY after checking an HMAC-SHA256
--      signature over `order_id|payment_id` against RAZORPAY_KEY_SECRET —
--      the same signature scheme Razorpay's checkout/webhook uses. If no
--      real payment-gateway secret is configured (RAZORPAY_KEY_SECRET
--      unset, which is the state of this project today — see
--      backend/.env.example), verification fails closed: no order for a
--      plan with a nonzero price can ever be marked 'paid'. This is the
--      correct behaviour for a production deployment that has not yet
--      wired in a real gateway — it must not be able to grant paid
--      credits at all, rather than silently trusting the client.
--   3. /purchase-plan itself now REQUIRES an orderId referencing a 'paid',
--      not-yet-consumed row that matches the merchant + planId being
--      purchased, and marks it 'consumed' in the same statement it grants
--      credits (single atomic UPDATE ... WHERE status='paid' AND NOT
--      consumed ... RETURNING) — a captured payment can fund exactly one
--      plan activation, never replayed twice.
--
-- IDEMPOTENT: safe to re-run.

create table if not exists public.payment_orders (
  id text primary key,
  "merchantId" text not null,
  purpose text not null,             -- 'plan' | 'addon'
  "itemId" text not null,             -- planId, or the addon id
  amount integer not null,            -- INR, resolved server-side from the catalog — never client-supplied
  status text not null default 'created',  -- 'created' | 'paid' | 'failed'
  consumed boolean not null default false, -- true once /purchase-plan or /extend-validity has spent this paid order
  "providerOrderId" text,
  "providerPaymentId" text,
  signature text,
  "createdAt" bigint not null,
  "paidAt" bigint
);

create index if not exists payment_orders_merchant_idx on public.payment_orders ("merchantId");

-- No anon/authenticated policies at all — same lockdown as merchants
-- (0005) and billing_requests/invoices (0007). Every payment_orders read/
-- write happens exclusively through the backend's BYPASSRLS `postgres`
-- connection (backend/app/payment_repo.py), gated by the merchant JWT
-- (require_merchant). There is no legitimate reason for a browser holding
-- only the anon key to read or write this table directly.
alter table public.payment_orders enable row level security;
alter table public.payment_orders force row level security;
revoke all on public.payment_orders from anon;
revoke all on public.payment_orders from authenticated;
