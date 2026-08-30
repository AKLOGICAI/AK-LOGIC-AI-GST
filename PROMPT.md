# AK-LOGIC AI GST — Master Development Prompt

*This file has two parts: (1) the Deep Accounting architecture spec, and (2) the wider Ecosystem Expansion master prompt (6 modules). Give this whole file to any developer or AI coding agent working on this repo or `AK-LOGIC-AI-PLATFORM`.*

---

# PART 1 — Deep Accounting Architecture Audit & Implementation Plan

*Analysis only — no code changed. Based on live audit of `anilk359901-hash/AK-LOGIC-AI-GST` on 2026-08-22.*

## 1. Current Architecture Snapshot

- **Frontend:** Vite + React + TypeScript (`src/`)
- **Backend:** Python FastAPI (`backend/app/`) — no ORM. Every module is a hand-written repo (`purchase_repo.py`, `inventory_repo.py`, `customer_repo.py`, `billing_repo.py`, `merchant_repo.py`) using SQLAlchemy `AsyncSession` + raw `text()` SQL.
- **Database:** Supabase-hosted Postgres.
  - **Important:** `supabase/migrations/` (27 numbered `.sql` files) is **not** the only source of schema truth. Several core tables — `merchant_purchases`, `purchase_items`, `merchant_inventory`, `customers` — are created at runtime via each repo's own `ensure_schema()` function (`CREATE TABLE IF NOT EXISTS ...`), completely outside the migrations folder. Any new accounting tables should follow this same `ensure_schema()` pattern for consistency, and optionally get a matching numbered migration file for documentation/parity.

## 2. Purchase Bill OCR — Full Flow (start to end)

```
PurchasesPage.tsx (user uploads PDF/photo)
  → src/lib/purchaseService.ts : uploadOcr()
  → POST /api/merchant/purchases/upload-ocr
  → backend/app/routers/purchases.py : upload_purchase_ocr()
      → backend/app/purchase_ocr_parser.py : process_file_bytes()
            → backend/app/ocr_service.py (Google Cloud Vision → raw text)
            → parse_ocr_text() — regex extraction of supplier, bill#, items,
              qty, rate, taxable value, CGST/SGST/IGST, total
      → purchase_repo.check_duplicate_purchase() (bill_number + supplier match)
      → returns { ok, parsed: {..., isDuplicate, duplicateInfo} } to frontend
  → user reviews/edits extracted fields in UI
  → POST /api/merchant/purchases/confirm
  → routers/purchases.py : confirm_purchase()
      → purchase_repo.save_purchase_and_replenish_stock()   ← core function
            1. INSERT INTO merchant_purchases (header row)
            2. INSERT INTO purchase_items (one row per line item)
            3. UPSERT merchant_inventory
               (match existing product by name, or HSN if HSN ≥ 6 digits;
                increment stock_quantity, else create new inventory row)
          — all inside a single DB transaction (atomic)
  → GET /api/merchant/purchases — lists purchase history (joins items)
```

## 3. Where OCR-extracted fields currently land

| Extracted field | Table.column |
|---|---|
| Supplier name / GSTIN | `merchant_purchases.supplier_name` / `.supplier_gstin` (flat text) |
| Bill number / date | `merchant_purchases.bill_number` / `.bill_date` |
| Items, qty, rate, HSN, GST% | `purchase_items` (one row per item) |
| Taxable value | Not stored explicitly — implied as `total_amount − total_tax` |
| CGST / SGST / IGST / total tax | `merchant_purchases.cgst` / `.sgst` / `.igst` / `.total_tax` (flat numeric) |
| Stock increase | `merchant_inventory.stock_quantity` (incremented in place) |

## 4. Existing Inventory Tables

- **`public.merchant_inventory`** — the only inventory table.
  Columns: `product_name`, `description`, `hsn_code`, `gst_rate`, `selling_price`, `cost_price`, `stock_quantity`, `unit`, `is_active`.
  - No batch/lot tracking.
  - No stock-movement audit trail — `stock_quantity` is overwritten in place on every purchase/sale; there is no ledger of *why* it changed.

## 5. Supplier / Vendor Ledger — **Does not exist**

No `suppliers` table, no `supplier_repo.py`. Supplier identity is duplicated as free-text (`supplier_name`, `supplier_gstin`) on every single `merchant_purchases` row. There is:
- No normalized supplier entity
- No running payable balance
- No supplier-wise statement/ledger

## 6. Customer Ledger / Receivable — **Partially exists (identity only, not a ledger)**

`public.customers` (via `customer_repo.py`) is a **KYC/identity vault**: name, phone, GSTIN, billing address, sequential `customerCode` (`AKC-00000001`). It supports resilient lookup (phone or code, various formats).

However:
- `public.invoices` has **no `customer_id` foreign key** — it stores `customerName` / `customerPhone` / `customerGstin` as flat text columns, disconnected from the `customers` table.
- There is no running receivable balance, no customer-wise outstanding/aging report — only a flat invoice list.

## 7. GST Input/Output Tax — **Invoice calculation only, not an accounting transaction**

`backend/app/gst_engine.py` is a pure, stateless calculator (deliberately kept identical to the frontend's `src/lib/gstEngine.ts` so previews and backend invoices always match). It computes `cgst`/`sgst`/`igst`/`totalTax` and the result is saved as flat numeric columns on the `invoices` row (output tax) or `merchant_purchases` row (input tax).

There is no:
- GST ledger / liability register
- Input Tax Credit (ITC) accumulation across purchases
- Reconciliation between output tax collected and input tax paid

## 8. Minimum New Tables for Double-Entry Accounting

Only **3 new tables** are needed:

1. **`chart_of_accounts`**
   `id, merchant_id, code, name, type (asset|liability|income|expense|equity), parent_id`
2. **`journal_entries`** (header)
   `id, merchant_id, entry_date, narration, source_type, source_id, created_at`
   (`source_type`/`source_id` trace back to the originating `purchase` or `invoice` row)
3. **`journal_lines`**
   `id, journal_entry_id, account_id, debit, credit, party_type (nullable: 'supplier'|'customer'), party_ref (nullable text, e.g. supplier_gstin or customerCode)`

Supplier and customer **sub-ledgers are derived**, not separately stored — a supplier statement is just `journal_lines` filtered by `party_ref`. This avoids yet more new tables.

## 9. Can an existing Purchase auto-generate a Journal Entry? — **Yes**

`purchase_repo.save_purchase_and_replenish_stock()` already computes/holds every value needed (taxable value, cgst, sgst, igst, supplier, total) inside one transaction. Posting a journal entry is a natural **additional step inside the same transaction** — no new integration point, no new failure mode beyond what already exists.

## 10. Can one Purchase Bill simultaneously do all four? — **Yes**

```
Dr   Purchase / Inventory A/c     (taxable value)
Dr   Input CGST A/c               (cgst)
Dr   Input SGST A/c               (sgst)
Dr   Input IGST A/c               (igst)
     Cr   Supplier Payable A/c    (total_amount)
```
This is exactly what a new `accounting_engine.py` pure function would produce: given the same payload `save_purchase_and_replenish_stock()` already receives, return a list of journal lines. No OCR/inventory logic needs to change.

## 11. Duplicate Detection & Reversal / Credit-Note Support

- **Duplicate detection: exists.** `purchase_repo.check_duplicate_purchase()` matches on `bill_number` + (`supplier_gstin` or `supplier_name`), case-insensitive.
- **Reversal / credit-note: does not exist anywhere** — no void/reverse endpoint for either purchases or invoices in the entire codebase (confirmed via full-repo search). Deep Accounting must add this as a **reversing journal entry** (equal-and-opposite debit/credit), never a hard delete — the accounting-safe pattern.

## 12. Where should the Accounting Engine live? (Cleanest option)

**A new, isolated module** — not inside `gst_engine.py` (a pure calculator shared by frontend and backend; it should not gain DB/side-effect responsibilities) and not merged directly into `purchase_repo.py` (would break single-responsibility and make the existing purchase flow harder to reason about or roll back independently).

Recommended:
- `backend/app/accounting_repo.py` — schema (`ensure_schema()`) + CRUD + ledger queries, following the **exact same repo pattern** as every other file in this codebase (`AsyncSession` + `text()`). Zero new patterns to learn.
- `backend/app/accounting_engine.py` — pure functions: `(purchase_or_invoice_dict) -> list[journal_line]`. Mirrors `gst_engine.py`'s style; fully unit-testable without a DB.
- **Hook point:** a small additional call from inside `purchase_repo.save_purchase_and_replenish_stock()` and `billing_repo.approve_request_with_invoice()` — wrapped in a feature-flag check and `try/except` so failure never blocks the existing purchase/invoice save.
- **Feature flag:** the codebase already has `backend/app/feature_flags_repo.py`. Reuse it directly — add a `deep_accounting_enabled` flag, default `False`. This mirrors the codebase's own established "feature-optional, never blocks" pattern already used for OTP/Razorpay/OCR in `config.py`.

## 13. Minimum Viable Deep Accounting — Files / Tables / APIs to change

### New files (nothing existing is restructured)
| File | Purpose |
|---|---|
| `backend/app/accounting_repo.py` | Schema + CRUD for chart_of_accounts, journal_entries, journal_lines |
| `backend/app/accounting_engine.py` | Pure functions: purchase/invoice → journal lines |
| `backend/app/routers/accounting.py` | Read-only endpoints: trial balance, ledger by account, supplier payables, customer receivables |
| `supabase/migrations/0028_accounting_core.sql` *(optional, for documentation parity)* | Mirrors what `ensure_schema()` creates |
| `src/lib/accountingService.ts` | Frontend API client for the new endpoints |
| `src/pages/dashboard/AccountingPage.tsx` *(Phase 3)* | New UI: trial balance / ledgers |

### Existing files touched — additive only, feature-flag gated
| File | Change |
|---|---|
| `backend/app/purchase_repo.py` | ~10 lines added inside `save_purchase_and_replenish_stock()`, after existing inserts, guarded by `if flag_enabled: await accounting_repo.post_journal(...)` |
| `backend/app/billing_repo.py` | Similar addition inside `approve_request_with_invoice()` for the sales side |
| `backend/app/main.py` | One line — register the new `accounting` router (same pattern as every other router) |
| `backend/app/feature_flags_repo.py` | Add `deep_accounting_enabled` to the flag list |

### Nothing else changes
`gst_engine.py`, the OCR pipeline, inventory upsert logic, the customer vault, and invoice generation UI remain **byte-identical in behavior** when the flag is off. When on, only *additional* rows get written — no existing read path changes.

## 14. Feature-Flag / Isolated Module Approach

1. Ship Phase 1 with the flag **hard-coded off** — new tables exist but nothing calls them. Zero risk.
2. Turn the flag on for **one test merchant only** (flag is per-merchant, reusing existing `feature_flags_repo.py` semantics).
3. Verify journal entries balance (debits = credits) and match existing purchase/invoice totals exactly, using the new read-only accounting API — without touching any live merchant.
4. Roll out merchant-by-merchant, never a global switch.

This means at every point, **every currently-live feature keeps working exactly as today** for every merchant not explicitly opted in.

## 15. Exact Implementation Plan

### Phase 1 — Foundation (invisible to all users)
**Files:** `accounting_repo.py` (new), `accounting_engine.py` (new), optional `0028_accounting_core.sql` (new)
**DB:** `chart_of_accounts`, `journal_entries`, `journal_lines` created (empty, unused)
**Flag:** `deep_accounting_enabled` added to `feature_flags_repo.py`, default `False`
**Outcome:** Schema and pure calculation logic exist and are unit-testable. No existing file is touched. Zero behavior change anywhere for any merchant.

### Phase 2 — Wire Purchases → Journal (flag-gated, single flow)
**Files touched (additive only):** `purchase_repo.py` (few lines inside `save_purchase_and_replenish_stock`), `routers/accounting.py` (new, read-only: trial balance, ledger by account, supplier payable summary)
**Outcome:** For flagged-in merchants, every new Purchase Bill confirmation auto-posts the 4-line journal entry (Purchase Dr, Input CGST/SGST/IGST Dr, Supplier Payable Cr), verifiable via the new read-only API. OCR, inventory replenishment, and existing purchase behavior remain byte-for-byte identical.

### Phase 3 — Sales side + Reversal/Credit-Note + UI
**Files touched (additive):** `billing_repo.py` (journal posting on invoice approval, flag-gated), new `accounting_repo.reverse_journal_entry()` (posts an equal-and-opposite entry — never deletes), new `AccountingPage.tsx` + `accountingService.ts` (trial balance / ledgers / supplier payables / customer receivables, shown to the merchant)
**Outcome:** Full double-entry loop (purchases + sales + reversals) exposed in the UI, fully opt-in via feature flag. Existing invoice/purchase/inventory pages remain untouched.

*End of Deep Accounting analysis. No code was modified as part of this document.*

---

# PART 2 — Ecosystem Expansion Master Prompt (6 Modules)

*Give this section to the developer / AI coding agent working on this repo and `AK-LOGIC-AI-PLATFORM`. Do not skip the Ground Rules — they apply to every module below.*

## ⚠️ GROUND RULES (apply to all 6 modules below — non-negotiable)

1. **PLAN FIRST, CODE SECOND.** For every module below, first produce a written plan covering: which existing files/tables you will read from, which new files/tables you propose, which existing files get touched (and exactly which lines/functions), and how the feature is turned on/off. **Do not write implementation code until this plan is reviewed and approved.**
2. **Maximum reuse, minimum new surface area.** Before creating anything new, check whether an existing repo/table/pattern already does 80% of the job (this codebase already has a consistent `*_repo.py` + `ensure_schema()` + `AsyncSession` + `text()` pattern — follow it exactly, don't invent a new one).
3. **Everything is feature-flagged and additive.** Reuse the existing `backend/app/feature_flags_repo.py` mechanism. Every new module ships **default OFF**, and when off, produces **zero behavior change** to any existing live feature (GST billing, OCR, inventory, invoices, chat, merchant network, website, customer dashboard). Wrap new logic in `try/except` so a failure in a new module never blocks an existing flow.
4. **No breaking changes to existing tables.** Only additive columns (nullable, with defaults) or brand-new tables. Never rename/drop/alter a column that existing code already reads.
5. **Explicit interconnection is required, not optional.** Every module below must specify exactly how it plugs into the *existing* modules — the same way `merchant_inventory` is already automatically connected to the merchant's public website. A module that works in isolation and doesn't talk to the rest of the ecosystem is an incomplete deliverable.
6. **Rollout is merchant-by-merchant**, never a global switch — enable the flag for one test merchant, verify, then expand.

## MODULE 1 — @akai: AI Identity Inside Merchant ↔ Merchant Chat

**Goal:** Inside any existing merchant-to-merchant (or customer-to-merchant, if applicable) chat thread, typing `@akai` should pull the AI into that specific conversation, with full context of that thread and the identities/business data involved — not a separate generic chatbot.

**What must be analyzed first (Plan phase):**
- Exact existing chat schema/tables (`chat_repo.py` — confirm message table structure, thread/participant model).
- How messages are currently delivered (the existing WebSocket path in `routers/chat.py`).
- What "context" is realistically available per thread today (merchant IDs, any linked purchase/invoice/order reference already attached to a chat thread, if any).

**Required behavior:**
- Detecting `@akai` as a mention inside a message (same message-send path everyone already uses — no new chat pipe).
- When mentioned, the AI reads: the thread's recent message history + the identities of the two merchants (or merchant+customer) in that thread + any linked business object (e.g. an open purchase/invoice/order referenced in that chat, if the schema supports linking one).
- AI's response is posted back into the **same thread** as a normal message (visually distinguishable — e.g. a bot/system sender flag), not a popup or separate panel.
- AI must only ever see/use data the two participants in that thread are already authorized to see (no cross-merchant data leakage through the AI).
- Rate-limit `@akai` invocations the same way OCR/OTP are already rate-limited (`rate_limit_repo.py` — reuse it, add a new isolated `akai:` namespace key, exactly like OCR added its own `ocr:` namespace without touching other limits).

**Interconnection requirement:** `@akai` must be able to reference and act on real ecosystem data — e.g. "check karo Anil Merchant se pichla purchase kab hua tha" should be answerable by querying `purchase_repo`/`billing_repo` read-paths (read-only at first), not a generic LLM answer with no grounding.

## MODULE 2 — Primary Merchant System

**Goal:** Every customer (AKC ID holder) can have one designated Primary Merchant. New orders/requests from the customer's dashboard go to the primary merchant first, with a time-boxed first-response window (~15 minutes, matching what's already partially confirmed in the merchant network escalation logic), before falling through to the wider merchant network.

**What must be analyzed first (Plan phase):**
- Confirm exact current merchant-network escalation code path (`merchant_network_repo.py`) — the 15-minute window logic already exists there for *something*; check if it's reusable as-is or needs generalizing to also serve "primary merchant" routing rather than only its current trigger.
- Confirm `customers` table structure (`customer_repo.py`) — this is where a `primary_merchant_id` (nullable FK to `merchants.id`) will most likely be added.

**Required data/behavior:**
- New nullable column: `customers.primary_merchant_id` (or a small separate `customer_merchant_relationships` table if a customer should be able to hold *history* of past primary merchants, not just the current one — decide in the plan phase which is truly needed, don't over-build).
- Customer-facing controls: set primary merchant (first interaction, or explicitly from dashboard), **change** primary merchant, **remove/delete** primary merchant — customer must have full control, never merchant-forced.
- Order/request routing: when a customer places a new order/request from the AK-LOGIC dashboard (not a fresh QR scan of a *different* merchant), it should route first to `primary_merchant_id` if set, using the *same* escalation/timeout mechanism already built for merchant network requests.
- Audit trail of primary-merchant changes (who changed it, when) — reuse the existing audit-log pattern already used for customer lookups (`customer_lookup_audit_logs`).

**Interconnection requirement:** This must plug into the *existing* order/request creation path and the *existing* merchant network escalation path — not a parallel routing system.

## MODULE 3 — Deep Accounting (Double-Entry Ledger)

*See PART 1 above for the full spec.* Goal: real double-entry accounting layer (chart of accounts, journal entries, journal lines) without touching existing GST calculation, OCR, inventory, or invoice logic. Prioritize this module along with Module 2 — both are the biggest foundational gaps.

## MODULE 4 — Smarter Website Design Differentiation

**Goal:** Each merchant's public storefront (already existing — `website_repo.py` + `WebsitePage`/public storefront frontend) should feel genuinely distinct per merchant, not a reskinned template, and should get *smarter* over time using data the ecosystem already has.

**What must be analyzed first (Plan phase):**
- Confirm exactly what's currently configurable per merchant website today (colors? layout blocks? product ordering? — read `website_repo.py` and the frontend `WebsitePage`/public store components fully before proposing anything).
- Confirm what merchant "product intelligence" already exists — note that `billing_repo.get_product_intelligence()` **already computes** per-merchant sales frequency/recency/pricing per product from invoice history. This is a ready-made input for a smarter storefront.

**Required behavior (build only what doesn't already exist):**
- Feed `get_product_intelligence()` output into the storefront to auto-highlight best-selling / trending products, instead of a static manually-ordered list — this is "smarter," not "different template."
- Expand available design differentiation knobs (theme, layout, featured-section logic) only as far as the current `website_repo.py` schema doesn't already support — extend additively, don't replace.
- Auto-sync remains as-is: approved inventory → website, already working; do not touch that trigger.

**Interconnection requirement:** The storefront's "smart" behavior must be *derived* from existing invoice/inventory data (already flowing through `billing_repo`/`inventory_repo`), not a separate manually-maintained config.

## MODULE 5 — ONDC Integration (Backend Readiness)

**Goal:** Prepare the backend so that when ONDC integration is greenlit, it's a matter of turning on a flag and filling in credentials — not a ground-up build.

**What must be analyzed first (Plan phase):**
- ONDC's standard integration model is: a Registry lookup + Buyer/Seller app endpoints (`/search`, `/select`, `/init`, `/confirm`, `/status`, etc.) exposed over a signed HTTPS callback protocol. Confirm which side (Seller Network Participant) AK-LOGIC needs to implement, since merchants are sellers here.

**Required deliverables for this phase (readiness only, not full integration):**
- A new isolated router `backend/app/routers/ondc.py` with the standard callback endpoints stubbed (accept + acknowledge, log payload, do nothing else yet) — so ONDC's own onboarding/testing tools can hit real endpoints without any merchant-facing behavior changing.
- New environment variables (documented, not necessarily all filled immediately):
  - `ONDC_SUBSCRIBER_ID`
  - `ONDC_SUBSCRIBER_URL`
  - `ONDC_SIGNING_PRIVATE_KEY` / `ONDC_SIGNING_PUBLIC_KEY`
  - `ONDC_ENCRYPTION_PRIVATE_KEY` / `ONDC_ENCRYPTION_PUBLIC_KEY`
  - `ONDC_REGISTRY_BASE_URL` (staging vs prod)
  - `ONDC_ENABLED` (feature flag, default `false`)
- A mapping plan (in the written plan, not code yet) for how an ONDC "catalog" maps to existing `merchant_inventory`, and how an incoming ONDC order maps to the existing order/billing pipeline — so that when built, it plugs into what already exists rather than creating a parallel order system.

**Interconnection requirement:** ONDC orders, once live, must land in the *same* order/invoice/inventory pipeline every other order already uses — not a separate ONDC-only data path.

## MODULE 6 — Parcel / Delivery Module

**Goal:** Add delivery/logistics tracking tied to existing orders/invoices — currently completely absent from the codebase.

**What must be analyzed first (Plan phase):**
- Confirm there is truly zero existing delivery-related table/router (already confirmed absent in the last audit, but re-verify before building, in case something was added since).
- Decide scope for v1: self-fulfilled delivery tracking (merchant marks an order as picked/shipped/delivered) vs. third-party courier API integration. **Recommend starting with self-fulfilled tracking only** — third-party courier integration is a much bigger, separate scope and should not be bundled into v1.

**Required new tables (minimum for v1):**
- `deliveries` — `id, merchant_id, invoice_id (nullable FK), order_ref, status (pending|picked|in_transit|delivered|failed), address, recipient_name, recipient_phone, courier_name (nullable, free text for now), tracking_ref (nullable), created_at, updated_at`
- Status-change history (`delivery_status_events`) if an audit trail of status changes is needed — mirror the pattern used elsewhere (e.g. `customer_lookup_audit_logs`) rather than inventing a new one.

**Interconnection requirement:** A `deliveries` row should be creatable directly from an existing `invoices` row (one click: "mark as shipped" on an already-generated invoice) — not a standalone delivery-creation form disconnected from the invoice/order that generated it.

## Final Deliverable Expected From The Developer / Agent

For **each of the 6 modules above**, before any code is written, produce:

1. A short plan: existing files read, new files/tables proposed, existing files touched (with function names), feature-flag name used.
2. Explicit answer to: **"How does this connect to what already exists?"** — one sentence minimum per module, matching the *Interconnection requirement* stated above.
3. Only after the plan for a module is confirmed, implement that module in isolation, flag OFF by default, and verify zero behavior change to every existing live feature (GST billing, OCR, inventory, invoices, customer dashboard, merchant network, chat, website) before moving to the next module.

Modules can be built in any order the developer prefers, but **Module 3 (Accounting)** and **Module 2 (Primary Merchant)** are the two biggest foundational gaps and should generally be prioritized before Module 5/6 (ONDC/Delivery), which are explicitly future-facing per the existing roadmap.
