-- QR Inventory: real, backend-only pool of pre-printed Merchant QR stickers.
-- =============================================================================
-- CONTEXT: the Admin "QR Inventory" screen (src/pages/admin/AdminQrInventory.tsx)
-- previously read/wrote a `qr_inventory` "table" that only ever lived in the
-- ADMIN'S OWN BROWSER localStorage (see src/lib/db.ts's `Table` class and the
-- old adminService.generateQrBatch in services.ts). Generating "500 QR codes"
-- did nothing outside that one browser tab: the codes were never reachable by
-- the customer-facing /pay/:qrId flow (which has always queried the REAL
-- public.merchants table via backend/app/merchant_repo.py's get_by_qr_id), so
-- every printed sticker 404'd for every customer with "No merchant found for
-- this QR code" — exactly the bug in the screenshot this migration fixes.
--
-- This migration makes the QR pool a real Postgres table, generated and
-- assigned entirely through the backend (backend/app/qr_inventory_repo.py +
-- routers/admin.py), so:
--   1. A batch of codes (AKM-000001, AKM-000002, ...) can be pre-generated
--      and printed before any merchant exists.
--   2. An admin assigns one physical sticker to a merchant — this WRITES
--      that code into merchants."qrId", which is the exact column the
--      existing customer /pay/:qrId lookup already reads. No change needed
--      to the customer-facing flow at all.
--   3. If a merchant stops using their QR (loses the sticker, closes the
--      account, etc.), the admin unassigns it — merchants."qrId" is cleared
--      back to NULL (a unique index already allows multiple NULLs — see
--      migration 0001) and the code returns to the "available" pool to be
--      re-assigned to a different merchant later.
--
-- ADDITIVE ONLY: does not alter/rename/drop any existing column or table.
-- Idempotent: safe to re-run.

-- ---------------- 1. Sequence backing the QR code numbering ----------------
-- Same primitive as merchant_code_seq (migration 0006): nextval() is atomic
-- under concurrent "Generate batch" calls and a value is never handed out
-- twice, so two admins generating at once can never collide.
create sequence if not exists public.qr_inventory_seq;

-- ---------------- 2. The pool table itself ----------------
create table if not exists public.qr_inventory (
  id               text primary key,
  code             text not null unique,          -- e.g. "AKM-000021"
  seq              bigint not null unique,          -- numeric part, for ordering
  status           text not null default 'available' check (status in ('available', 'assigned')),
  "assignedMerchantId" text references public.merchants(id) on delete set null,
  "assignedAt"     bigint,
  "createdAt"      bigint not null
);

create index if not exists qr_inventory_status_idx on public.qr_inventory (status);
create index if not exists qr_inventory_assigned_merchant_idx on public.qr_inventory ("assignedMerchantId");

-- ---------------- 3. Lock it down exactly like public.merchants ----------------
-- This table is only ever touched by the backend's own direct Postgres
-- connection (DATABASE_URL, BYPASSRLS role — see config.py), gated by
-- Depends(require_admin) in routers/admin.py. No anon/authenticated policy
-- is added, so with RLS enabled and zero matching policies, PostgREST (the
-- anon key shipped in the JS bundle) is denied all access — exactly the
-- same protection public.merchants already has (see migration 0005).
alter table public.qr_inventory enable row level security;
alter table public.qr_inventory force row level security;

revoke all on public.qr_inventory from anon;
revoke all on public.qr_inventory from authenticated;
