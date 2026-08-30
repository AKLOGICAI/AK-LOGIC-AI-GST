# AK-LOGIC AI — SECURITY AUDIT VERIFICATION REPORT

**Audit date:** 2026-08-14
**Fix pass 1 date:** 2026-08-15 (Critical + High severity findings)
**Scope:** Full re-verification of 25 previously-suspected findings (A–Y) against the live `main` branch, current Supabase RLS policy state (queried directly, not inferred from migration files), and current Render production configuration, wherever it could be checked safely.
**Method:** Static code tracing (routers → repo layer → schema → DB), live `pg_policies`/`pg_class.relrowsecurity` queries against the production database, and local Pydantic/logic reproduction. No production data was modified, no real payments were manipulated, and no live webhook/OTP/rate-limit was exercised against production to avoid the destructive-testing constraints.

> Only findings that could be proven against actual code/DB state are marked CONFIRMED. Everything else is either FALSE POSITIVE / ALREADY FIXED, or explicitly marked NOT CONFIRMED — insufficient evidence where full verification was out of safe-testing scope.
>
> **Fix status legend:** ✅ **FIXED & DEPLOYED** = shipped to production and verified. 🔧 **CONFIRMED, NOT YET FIXED** = documented, fix not yet applied.

---

## ✅ CONFIRMED VULNERABILITIES

## [CRITICAL] RLS-001 — `merchant_websites` / `website_gallery_images`: RLS policy grants unrestricted read+write+delete to anyone

### Status
✅ **FIXED & DEPLOYED** (2026-08-15)

### Location
- Supabase RLS policies `"allow_all_merchant_websites"` on `public.merchant_websites`
- Supabase RLS policy `"allow_all_gallery"` on `public.website_gallery_images`
- (Backend intent, correctly enforced but irrelevant here: `backend/app/routers/website.py`)

### Proof
Live query against `pg_policies` on the production database returns, for both tables:
```
cmd: ALL
qual: true
with_check: true
```
`relrowsecurity = true` on both tables (RLS is switched on), but because the *only* policy present grants `ALL` commands with `qual = true` / `with_check = true`, RLS is effectively disabled for these two tables — every row is readable, insertable, updatable, and deletable by **any** Postgres role permitted to query through PostgREST, which includes the `anon` role using the public `VITE_SUPABASE_ANON_KEY` that ships inside the frontend's JS bundle by design (Supabase's anon key is meant to be public *only* when RLS actually restricts it — here it does not).

By contrast, every other sensitive table in the schema (`merchants`, `billing_requests`, `invoices`, `customers`, `payment_orders`, `merchant_network_*`, etc.) has `relrowsecurity = true` **and zero policies**, which is Postgres's safe default-deny state. `merchant_websites`/`website_gallery_images` are the only tables where an explicit wide-open exception was carved into that otherwise-solid posture.

### Reproduction (safe — read-only, against non-production test row only)
This was verified via direct inspection of `pg_policies`/`pg_class`, not by issuing a live anon-key write against a real merchant's row (which would violate the "do not modify real merchant data" rule). The exploit path is architecturally certain given the policy definition:
```
POST https://<project>.supabase.co/rest/v1/merchant_websites
apikey: <public VITE_SUPABASE_ANON_KEY>
Content-Type: application/json
{ "merchant_id": "<any-victim-id>", "slug": "hijacked", "hero_title": "..." }
```
would succeed against the live policy as written — no `require_merchant`/backend auth is in the path at all, because PostgREST talks to Postgres directly.

### Impact
Any internet user who extracts the public anon key (trivial — it is shipped client-side) can read every merchant's website configuration, and — more seriously — **insert, modify, or delete** any merchant's published website (slug, theme, hero/about/contact content, gallery images), entirely bypassing `require_merchant` ownership checks in `website.py`. This can be used to deface a competitor's storefront, redirect their published `/store/{slug}` content, or wipe their gallery.

### Fix (applied)
Dropped `"allow_all_merchant_websites"` and `"allow_all_gallery"` via Supabase migration (`rls001_lockdown_website_gallery`), leaving both tables with zero policies — the same default-deny posture as every other core table. No replacement policy was added since the backend's own authenticated routes already serve 100% of this feature via a direct-Postgres connection that bypasses RLS by role design.

### Verification (done)
Re-queried `pg_policies` immediately after applying the migration: both tables now return **zero rows** (previously one wide-open policy each). Confirmed no new errors in Render logs after the change, and the backend's own website-builder endpoints continued working normally (unaffected, since they never went through PostgREST/RLS in the first place).

---

## [HIGH] RLS-002 — `chat_threads` / `chat_messages`: RLS policy grants unrestricted read to anyone

### Status
✅ **FIXED & DEPLOYED** (2026-08-15)

### Location
Supabase RLS policies `"Chat Threads Service Role Read"` / `"Chat Messages Service Role Read"` on `public.chat_threads` / `public.chat_messages` — `supabase/migrations/0025_customer_merchant_chat.sql`

### Proof
Live `pg_policies` query confirms both policies are still `cmd: SELECT`, `qual: true` — despite the naming ("Service Role Read"), the policy is not restricted to the `service_role`; it applies to any role able to query the table, including `anon`.

### Reproduction
Same class of exploit as RLS-001: a direct PostgREST `GET` against `chat_messages`/`chat_threads` using the public anon key returns every merchant↔customer chat message on the platform, with no ownership filter.

### Impact
Full read access to private merchant↔customer conversations for anyone with the (publicly shipped) anon key — including any images/attachments referenced.

### Fix (applied)
Dropped both `"...Service Role Read"` SELECT policies via Supabase migration (`rls002_lockdown_chat`), leaving `chat_threads`/`chat_messages` with zero policies — default-deny, matching every other core table. The backend's own `chat.py` routes (which already enforce ownership correctly) are unaffected since they use a direct-Postgres connection that bypasses RLS.

### Verification (done)
Re-queried `pg_policies` immediately after applying the migration: both tables now return **zero rows**. Confirmed no new errors in Render logs after the change.

---

## [HIGH] CUST-001 — `customer-select` exposes full unmasked customer PII via a guessable, sequential ID with no rate limit

### Status
✅ **FIXED & DEPLOYED** (2026-08-15)

### Location
`backend/app/routers/customer.py` → `POST /api/customer/merchant/customer-select` (`select_customer_unmasked`)
`backend/app/customer_repo.py` → `get_unmasked_billing_profile`

### Proof
```python
@router.post("/merchant/customer-select")
async def select_customer_unmasked(
    body: CustomerSelectIn,
    req: Request,
    merchant_data: tuple[str, dict] = Depends(security.require_verified_merchant),
    db: AsyncSession = Depends(get_db),
):
    ...
    unmasked = await customer_repo.get_unmasked_billing_profile(db, code)
    return {"ok": True, "customer": unmasked}
```
This endpoint requires only that the caller be *some* KYC-verified merchant (`require_verified_merchant` — not scoped to a specific customer relationship) and a `customerCode` string. It performs **no PIN check**, **no proof that this merchant has ever transacted with this customer**, and **no rate limiting** (confirmed absent from `rate_limit_repo.py`'s call sites in `customer.py` — only the Tier-2 `customer-autofill` PIN-entry endpoint is rate-limited/lockout-protected). `CustomerAutofillIn`'s AKC codes are generated sequentially (`AKC-00000001`, `AKC-00000002`, ...), making them trivially enumerable.

The two-step UI flow (masked "search" then unmasked "select") is a *frontend* convention only — the backend does not require or verify that step 1 ("search") was ever called before step 2 ("select") succeeds for a given code.

### Reproduction (static/local, not run against production)
```
for i in range(1, 100000):
    code = f"AKC-{i:08d}"
    POST /api/customer/merchant/customer-select  {"customerCode": code}
    # with any verified-merchant JWT
```
Each valid code returns `{name, phone, email, gstin, billingAddress, companyName, state}` in full, unmasked.

### Impact
Any KYC-verified merchant account (a legitimate but potentially malicious or compromised account) can enumerate and exfiltrate the full PII of the entire customer database — not just customers they've dealt with.

### Fix (applied)
`backend/app/routers/customer.py`:
1. Added per-merchant AND per-IP rate limiting (`rate_limit_repo.check_and_increment_window`, 20 requests / 5 minutes) to both `customer-search` and `customer-select`.
2. Closed the "step 1 is UI-only" bypass: a successful masked search now opens a short-lived (10-minute) "select gate" scoped to `{merchantId}:{customerCode}` via `rate_limit_repo.put`. `customer-select` now requires this gate to be open (`rate_limit_repo.get`) before returning unmasked data, and returns 403 otherwise — so a code that was never genuinely searched for cannot be unmasked directly, no matter how it's guessed.

Verified against the real frontend flow (`CustomerSearchBar.tsx` always calls `selectCustomer(result.customerCode)` with the exact code the search step just returned), so legitimate usage is unaffected.

### Verification (done)
Deployed to Render (`dep-...`, commit `aec18a8`), confirmed `live` status and zero new errors in logs. Reviewed the exact call chain in `services.ts`/`CustomerSearchBar.tsx` to confirm the gate key (`merchantId` + `customerCode` from the search response) matches what the frontend's select call sends, so the fix cannot break the legitimate search→select flow.

---

## [HIGH] CREDIT-001 — `refund-credit` allows unlimited self-serve PDF credit generation

### Status
✅ **FIXED & DEPLOYED** (2026-08-15)

### Location
`backend/app/routers/merchant.py` → `POST /api/merchant/refund-credit`
`backend/app/merchant_repo.py` → `refund_credit`

### Proof
```python
@router.post("/refund-credit")
async def refund_credit(payload: RefundCreditIn, merchant_id: str = Depends(require_merchant), db=Depends(get_db)):
    ...
    updated = await merchant_repo.refund_credit(db, merchant_id, payload.count)
    return {"ok": True, "merchant": updated}
```
`merchant_repo.refund_credit` unconditionally executes `UPDATE merchants SET "pdfCredits" = "pdfCredits" + :count WHERE id = :id` — there is **no ledger check**, **no matching-consume verification**, and **no idempotency key** tying a refund to a specific failed invoice attempt, despite the route's own docstring claiming this is only ever called by "the frontend's own already-authenticated invoice-approval flow ... when it can prove the matching invoice was never created." The backend does not enforce that claim at all. `RefundCreditIn.count` is capped at 100 per call (`Field(1, ge=1, le=100)`), but nothing prevents calling the endpoint an unlimited number of times.

Additional finding while fixing this: neither `/consume-credit` nor `/refund-credit` is currently called by any live frontend flow at all — the real invoice-approval path (`invoiceService.approve()`) deducts credits atomically inside `POST /api/merchant/invoices` server-side. Both endpoints were nonetheless live, publicly reachable, and exploitable.

### Reproduction (local/logic reproduction, not run against production)
Any authenticated merchant's own valid JWT can call:
```
POST /api/merchant/refund-credit
{"count": 100, "reason": "x"}
```
repeatedly, each call adding up to 100 PDF credits to their own account with zero verification.

### Impact
Complete bypass of the paid-plan PDF-credit revenue model — any merchant can self-generate unlimited free invoice credits.

### Fix (applied)
`backend/app/schemas.py` + `backend/app/routers/merchant.py`:
1. `/consume-credit` now issues a short-lived (1 hour), single-use "consumption receipt" (`consumptionId`) via `rate_limit_repo`'s existing key/value store immediately after a real deduction.
2. `RefundCreditIn.consumptionId` is now a required field. `/refund-credit` looks up the receipt for `{merchantId}:{consumptionId}`, requires the `count` to match exactly, and **deletes the receipt before crediting back** — so a given consumption can be refunded at most once, even under a race.

An attacker can no longer call `refund-credit` with an arbitrary count: they would first have to consume real credits to obtain a receipt, and can only ever recover that exact same amount once — net zero, closing the exploit entirely. Legitimate use (crediting back a deduction for an invoice that failed to save) is unaffected.

### Verification (done)
Deployed to Render (commits `b54df99`, `2494973`), confirmed `live` status and zero new errors in logs.

---

## [HIGH] B2B-001 — Order confirmation replay inflates trust-score (`successful_transactions`) without bound

### Status
✅ **FIXED & DEPLOYED** (2026-08-15)

### Location
`backend/app/routers/merchant_network.py` → `confirm_order`
`backend/app/merchant_network_repo.py` → `increment_successful_transactions`

### Proof
```python
buyer_confirmed_at = order["buyer_confirmed_at"]
seller_confirmed_at = order["seller_confirmed_at"]
if merchant["id"] == order["buyer_merchant_id"]:
    buyer_confirmed_at = now
else:
    seller_confirmed_at = now

final_status = order["status"]
if buyer_confirmed_at and seller_confirmed_at:
    final_status = "confirmed"

updated_order = await merchant_network_repo.update_order_confirmations(...)

if final_status == "confirmed":
    await merchant_network_repo.update_request_status(db, order["request_id"], "confirmed")
    await merchant_network_repo.increment_successful_transactions(db, order["buyer_merchant_id"])
    await merchant_network_repo.increment_successful_transactions(db, order["seller_merchant_id"])
```
The `if final_status == "confirmed":` branch fires whenever *both* confirmation timestamps are present **after** this call — including when the order was **already** `"confirmed"` from a *previous* call. There is no check of `order["status"] != "confirmed"` (i.e., "was this the transition that just completed it") before triggering the increment. `increment_successful_transactions` itself has no idempotency guard (`ON CONFLICT ... DO UPDATE SET successful_transactions = successful_transactions + 1`, unconditionally).

### Reproduction (local logic trace, not run against a real order)
1. Buyer and seller both confirm a real order once → order reaches `"confirmed"`, both trust scores +1 (correct).
2. Either party calls `POST /orders/{id}/confirm` again → `final_status` recomputes to `"confirmed"` again (since both timestamps are still truthy) → both parties' `successful_transactions` +1 again, with no new real transaction.
3. Repeat indefinitely.

### Impact
Either party to a real (one-time) trade can artificially and repeatedly inflate **both their own and their counterparty's** `successful_transactions` trust metric, undermining the entire B2B trust-score system used elsewhere to signal merchant reliability.

### Fix (applied)
`backend/app/routers/merchant_network.py`: `confirm_order` now captures `was_already_confirmed = order["status"] == "confirmed"` before touching anything, and only runs the request-status transition + trust-score increment + system chat message when `final_status == "confirmed" and not was_already_confirmed` — i.e. only on the actual transition, exactly once per order. A repeat `/confirm` call on an already-confirmed order still succeeds and re-notifies the partner (unchanged UX) but no longer touches trust scores.

### Verification (done)
Deployed to Render (commit `d9cb01c`), confirmed `live` status and zero new errors in logs.

---

## [MEDIUM] B2B-002 — Duplicate reviews from the same reviewer on the same order (rating manipulation)

### Status
🔧 CONFIRMED, NOT YET FIXED

### Location
`backend/app/routers/merchant_network.py` → `rate_order_endpoint`
`backend/app/merchant_network_repo.py` → `create_review`

### Proof
`rate_order_endpoint` only checks that the calling merchant is one of the two parties on the order (`merchant["id"] not in (buyer, seller)` → 403). It does not check order status, and does not check whether this reviewer has already rated this order. `create_review` performs a plain `INSERT` into `merchant_network_reviews` with no `UNIQUE(order_id, reviewer_merchant_id)` constraint backing it, and the reviewee's trust score is recomputed as an average over *all* review rows for that merchant.

### Reproduction (logic trace)
Either buyer or seller on a real order can call `POST /orders/{id}/rate` an arbitrary number of times with different ratings; each call inserts a new row and shifts the reviewee's average score.

### Impact
A merchant can collude with a trading partner to spam 5-star reviews (reputation inflation) or, if the relationship sours, spam 1-star reviews (reputation sabotage) — either way skewing the platform's trust signal disproportionately to the number of *actual* trades.

### Fix
Add a unique constraint (or an application-level check) on `(order_id, reviewer_merchant_id)` in `merchant_network_reviews`, and reject a second rating attempt on the same order from the same reviewer.

### Verification
Attempt to rate the same order twice from the same merchant; the second call should be rejected.

---

## [MEDIUM] B2B-003 — `accept_response` has a TOCTOU race that can produce duplicate orders for one request

### Status
🔧 CONFIRMED, NOT YET FIXED

### Location
`backend/app/routers/merchant_network.py` → `accept_response`

### Proof
```python
request = await merchant_network_repo.get_request_by_id(db, request_id)
if request["status"] not in ("open", "responded"):
    raise HTTPException(400, "...")
...
await merchant_network_repo.update_request_status(db, request_id, "accepted")
await merchant_network_repo.insert_order(db, ...)
```
This is a classic check-then-act sequence with no `SELECT ... FOR UPDATE` row lock and no atomic conditional `UPDATE ... WHERE status IN (...) RETURNING ...` (the pattern this same codebase correctly uses elsewhere, e.g. `merchant_repo.try_use_free_invoice`). Two near-simultaneous `accept` calls for two different responders on the same request can both pass the status check before either `UPDATE` commits.

### Reproduction
Requires precise timing of two concurrent requests against the same still-open B2B request — not reproduced against production per the safe-testing constraints, but the absence of any locking primitive makes this a genuine, provable race window on inspection.

### Impact
Two orders could be created referencing the same request, with only one buyer/seller pairing intended — leading to a confused/duplicated trade state.

### Fix
Wrap the read-check-write in a single transaction using `SELECT ... FOR UPDATE` on the request row, or convert to an atomic conditional `UPDATE requests SET status='accepted' WHERE id=:id AND status IN ('open','responded') RETURNING *` and only proceed with order creation if a row was actually returned.

### Verification
Fire two concurrent accept calls in a test environment and confirm only one order is created.

---

## [MEDIUM] PAY-001 — Razorpay webhook signature verification fails open if `RAZORPAY_WEBHOOK_SECRET` is unset

### Status
🔧 CONFIRMED, NOT YET FIXED

### Location
`backend/app/main.py` → `razorpay_webhook`

### Proof
```python
if settings.razorpay_webhook_secret:
    expected = hmac.new(settings.razorpay_webhook_secret.encode(), ...).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise HTTPException(400, ...)
# falls through unconditionally if the secret is unset — no signature check performed at all
```
This is the same finding as our earlier internal audit's BUG-025 (documented in `PROMPT.md`) — it has not yet been fixed in the current `main` code.

### Impact
If the webhook secret is ever unset (misconfiguration, env var rotation mistake, new environment stood up without it), any POST to the public webhook endpoint claiming `event: "payment.captured"` against an existing unpaid `payment_orders` row would be accepted as genuine, without any real payment having occurred.

### Fix
Fail closed: if `razorpay_webhook_secret` is empty, reject the webhook with a 500 rather than skipping verification.

### Verification
With the secret intentionally unset in a non-production environment, confirm the webhook now returns 500 instead of processing the payload.

---

## [MEDIUM] JWT-001 — Admin JWTs share the same 30-day TTL as merchant tokens; no revocation mechanism

### Status
🔧 CONFIRMED, NOT YET FIXED

### Location
`backend/app/config.py` → `access_token_ttl_min: int = 30 * 24 * 60` (30 days)
`backend/app/security.py` → `create_token` / `require_admin`

### Proof
`create_token()` uses the single global `settings.access_token_ttl_min` for every realm — merchant, admin, and customer alike. There is no realm-specific shorter expiry for admin tokens at the JWT layer. `require_admin` only checks `realm == "admin"` on decode; unlike `require_merchant` (which re-validates the token's embedded `mpin_hash` against the merchant's *current* MPIN, effectively revoking all old sessions the moment a merchant changes their MPIN), there is no equivalent server-side revalidation for admin tokens — so changing the admin password does **not** invalidate already-issued admin JWTs.

Separately, the frontend's own local session bookkeeping assumes a 24-hour admin session lifetime (a client-side-only convention) — this does not correspond to the actual server-side token validity, which is 30 days.

### Impact
A leaked/stolen admin JWT (via XSS, log exposure, shared-device browser storage, etc.) remains fully valid against the API for up to 30 days, regardless of the frontend's 24-hour assumption, and regardless of the admin subsequently changing their password.

### Fix
Issue admin tokens with a materially shorter TTL than merchant tokens (e.g. a few hours), and/or add a revocation mechanism (e.g. a `token_version`/`sessions_invalidated_at` column checked on every admin request, incremented on password change or explicit "log out all sessions").

### Verification
Change the admin password and confirm a previously-issued admin JWT is rejected on the next request.

---

## [LOW] RATE-001 — Public website-store endpoints have no rate limiting

### Status
🔧 CONFIRMED, NOT YET FIXED (previously documented as BUG-011 in `PROMPT.md`; re-verified, still unresolved)

### Location
`backend/app/routers/website.py` → `GET /public/store/{slug}`, `GET /public/store/{slug}/products`, `POST /public/store/{slug}/order`

### Proof
Unlike `billing.py` (`_check_create_throttle`) and `merchant.py`, `website.py` never imports or calls `rate_limit_repo`.

### Impact
Unauthenticated scraping/flooding of merchant storefronts and product catalogs, or spam order submissions.

### Fix
As previously documented: add the same `rate_limit_repo` per-IP window check already used elsewhere in the codebase.

### Verification
Fire >30 requests/minute from one IP against the store endpoint and confirm a 429 is eventually returned.

---

## ❌ FALSE POSITIVES / ALREADY FIXED / NOT CONFIRMED

### A. Merchant registration OTP verification
**Original concern:** OTP could be brute-forced or bypassed.
**Why it looked vulnerable:** OTP-based flows are a common weak point.
**Current protection:** `rate_limit_repo`-backed per-phone and per-IP attempt limits with lockout, OTP expiry, and single-use consumption on verify, consistently applied across the registration/login/reset flows reviewed in `merchant.py`/`customer.py`.
**Conclusion:** NOT CONFIRMED — no bypass found; properly protected.

### G. Branding upload resource exhaustion
**Original concern:** Unbounded image upload could exhaust server resources.
**Current protection:** `storage_service.py` compresses all uploads through Pillow with fixed max dimensions/quality before storage; base64 payload size is bounded by the request body itself.
**Conclusion:** NOT CONFIRMED — insufficient evidence of an exploitable unbounded-resource path within the scope of this review; would need dedicated load-testing (out of scope for safe verification) to fully rule in/out at extreme concurrency.

### H. MPIN reset token replay
### I. Customer reset token replay
**Original concern:** Reset tokens (`resetToken`) aren't single-use, so could be replayed.
**Why it looked vulnerable:** Best practice says reset tokens should be single-use.
**Current protection:** The token is only issued after the caller already proves phone-number ownership via a real OTP. Replaying it within its short (10-minute) validity window grants no capability beyond what a single legitimate use already grants (a full MPIN/PIN reset) — there is no privilege escalation from replay itself.
**Conclusion:** FALSE POSITIVE as a distinct vulnerability — the lack of single-use enforcement is a defense-in-depth gap worth tightening, but is not independently exploitable beyond the access already granted by passing the OTP step once.

### J. Invoice number sequence burning
**Original concern:** Calling `next-invoice-number` repeatedly without approving could burn through the sequence.
**Current protection:** N/A — this has no security consequence; it only produces non-contiguous invoice numbers, which is a bookkeeping/GST-filing cosmetic concern, not an authorization or data-exposure issue.
**Conclusion:** NOT A SECURITY FINDING — out of scope for this audit.

### M. Broad CORS
**Original concern:** `allow_origin_regex` permits any `*.vercel.app` subdomain and any `localhost`.
**Current protection:** `allow_credentials=False` — the API never relies on cookies; all auth is via `Authorization: Bearer` headers set explicitly by the frontend's own JS, which a third-party origin cannot forge purely via a permissive CORS policy (no ambient credentials to ride on).
**Conclusion:** FALSE POSITIVE at HIGH severity — the CORS policy is broader than ideal (worth tightening to the known production domains only) but does not by itself enable cross-origin credential theft given `allow_credentials=False`.

### N. 30-day merchant JWT lifetime
**Original concern:** A 30-day merchant token is a large exposure window if leaked.
**Current protection:** `require_merchant` re-validates the token's embedded `mpin_hash` against the merchant's *current* MPIN on every request — changing the MPIN immediately invalidates every previously-issued token for that merchant, giving an effective, easy revocation path that most JWT-only designs lack.
**Conclusion:** FALSE POSITIVE for merchant tokens specifically — the equivalent gap for **admin** tokens is real and is reported separately as JWT-001.

### O. Admin JWT revocation
Folded into JWT-001 above (documented together with the 30-day TTL finding, since both stem from the same root cause).

### P. Signature/seal Base64 stored in database
**Original concern:** Storing signature/seal images as base64 directly in the `merchants` row is risky.
**Current protection:** The `merchants` table has RLS enabled with **zero** policies (default-deny for direct PostgREST/anon access); the only path to this data is the backend's own authenticated `require_merchant`-gated endpoints.
**Conclusion:** FALSE POSITIVE as an independently exploitable vulnerability — a data-hygiene improvement (prefer the signed-URL storage path already used elsewhere) but not currently reachable by an attacker given the surrounding access controls.

### Q. Public invoice sensitive-data exposure
### R. Public product stock exposure
**Original concern:** Public invoice-status/product endpoints might leak more than intended.
**Current protection:** Endpoints reviewed (`billing.py`'s public request-status lookup, `website.py`'s public product listing) operate on a single unguessable request ID or merchant-scoped product list, not a bulk/enumerable query.
**Conclusion:** NOT CONFIRMED — insufficient evidence of exploitable bulk exposure within the scope of this review; the request-ID-based lookup already has its own separate, previously-documented finding (BUG-028, no-expiry capability URL) rather than a fresh exposure here.

### S. Merchant-to-merchant IDOR
### T. Inventory authorization
### U. B2B order authorization
### V. Chat authorization (application layer)
**Original concern:** Swapping `merchant_id`/`order_id`/`item_id`/`thread_id` in requests might cross an authorization boundary.
**Current protection:** Every router endpoint reviewed (`merchant_network.py`'s order/request endpoints, `chat.py`'s thread endpoints, `inventory.py`) consistently re-derives the authenticated merchant's identity from the JWT (never trusts a client-supplied `merchantId`) and explicitly checks `merchant["id"] in (buyer_merchant_id, seller_merchant_id)` / thread ownership before allowing access.
**Conclusion:** NOT CONFIRMED — no IDOR found in the endpoints reviewed at the **application layer**. (Note: this is separate from RLS-001/RLS-002 above, which are **database-layer** exposures reachable only by bypassing the application entirely via direct PostgREST calls.)

### W. Admin privilege escalation
**Original concern:** A non-admin might be able to obtain admin-realm tokens.
**Current protection:** Admin login is a single bcrypt-hashed password check with per-IP lockout (`admin.py`); the only bypass path (a dev-only OTP shortcut) is gated behind `settings.environment != "production"` **and** an explicit `ALLOW_DEV_ADMIN_OTP=true` **and** a configured `DEV_ADMIN_OTP` value — fail-safe by default, and inert in production regardless of the other two flags.
**Conclusion:** NOT CONFIRMED — no escalation path found.

### X. Supabase RLS/migration final state
Addressed directly above as RLS-001 and RLS-002 (the two tables where the final live state was actually exploitable — both now fixed). Every other table checked (`merchants`, `billing_requests`, `customers`, `invoices`, `payment_orders`, `merchant_network_*`, `qr_inventory`, `merchant_inventory`, etc.) has RLS enabled with either zero policies (default-deny) or ownership-scoped policies — confirmed via a direct live query, not inferred from migration files alone.

### Y. Storage/signature/seal access
**Original concern:** Storage buckets might be misconfigured for public access.
**Current protection:** `merchant-signatures` bucket is `public: false`; the app only ever serves signature/seal images via `generate_signed_url` (time-limited, 1-hour presigned URLs), never a permanent public link. `merchant-branding` bucket is `public: true`, which is intentional and expected (logos/website images are meant to be publicly viewable on the merchant's published storefront/invoices).
**Conclusion:** NOT CONFIRMED — bucket configuration matches intended data sensitivity for each bucket.

---

## FINAL VERIFICATION SUMMARY

```
TOTAL CHECKED:     25 (A–Y)
CONFIRMED:         10
  CRITICAL:        1   (RLS-001)                          — ✅ FIXED
  HIGH:            4   (RLS-002, CUST-001, CREDIT-001,
                        B2B-001)                           — ✅ ALL 4 FIXED
  MEDIUM:          4   (B2B-002, B2B-003, PAY-001,
                        JWT-001)                            — 🔧 not yet fixed
  LOW:             1   (RATE-001)                          — 🔧 not yet fixed
FALSE POSITIVE:    11  (A, H, I, J, M, N, P, Q, R, S/T/U/V, W)
NOT CONFIRMED:     3   (G, Q, R — insufficient evidence for a bulk-exposure exploit within safe-testing scope)
FIXED THIS PASS:   5 / 5 Critical+High findings (2026-08-15)
STILL OPEN:        5 (all Medium/Low)
```

### Confirmed Vulnerabilities
1. **[CRITICAL]** ✅ RLS-001 — `merchant_websites`/`website_gallery_images` fully open via RLS — **FIXED**
2. **[HIGH]** ✅ RLS-002 — `chat_threads`/`chat_messages` readable by anyone via RLS — **FIXED**
3. **[HIGH]** ✅ CUST-001 — unrestricted unmasked customer PII lookup via guessable ID — **FIXED**
4. **[HIGH]** ✅ CREDIT-001 — unlimited self-serve PDF credit generation — **FIXED**
5. **[HIGH]** ✅ B2B-001 — trust-score inflation via confirm replay — **FIXED**
6. **[MEDIUM]** 🔧 B2B-002 — duplicate review / rating manipulation
7. **[MEDIUM]** 🔧 B2B-003 — accept-request race condition
8. **[MEDIUM]** 🔧 PAY-001 — webhook signature fail-open if secret unset
9. **[MEDIUM]** 🔧 JWT-001 — admin token TTL/revocation gap
10. **[LOW]** 🔧 RATE-001 — public store endpoints unthrottled

### False Positives / Already Fixed
A, H, I, J, M, N (merchant-specific), P, S, T, U, V, W — see individual write-ups above for why each does not survive verification.

### Security Strengths (verified, not previously credited)
- **Default-deny RLS posture** on every core business table (`merchants`, `billing_requests`, `customers`, `invoices`, `payment_orders`, `merchant_network_*`) — confirmed live via `pg_class.relrowsecurity`/`pg_policies`, not just assumed from migration history.
- **Merchant JWT self-revocation**: changing MPIN invalidates all previously-issued merchant tokens, a stronger property than plain JWT expiry alone.
- **OTP flow**: consistent rate limiting, lockout, expiry, and single-use enforcement across registration/login/reset.
- **Admin login**: fail-safe dev-bypass gating (three independent conditions must all hold, all production-inert by default).
- **Signature/seal storage**: private bucket + short-lived signed URLs only, never a permanent public link.
- **IDOR checks**: consistently applied at the application layer across B2B orders, inventory, and chat — the identity used for every authorization check is always derived from the server-verified JWT, never from client-supplied IDs.

### Recommended Fix Order
1. ~~**Critical:** RLS-001~~ ✅ **DONE**
2. ~~**High:** RLS-002, CUST-001, CREDIT-001, B2B-001~~ ✅ **DONE**
3. **Medium (next pass):** B2B-002 (duplicate reviews), B2B-003 (accept race), PAY-001 (webhook fail-open), JWT-001 (admin token TTL/revocation)
4. **Low (next pass):** RATE-001 (public store rate limiting)

---

## FIX PASS 1 LOG (2026-08-15)

All 5 Critical+High findings fixed, deployed, and verified in this pass:

| Finding | Fix location | Commit(s) | Deploy status |
|---|---|---|---|
| RLS-001 | Supabase migration `rls001_lockdown_website_gallery` | (DB migration, not a git commit) | Applied & verified live |
| RLS-002 | Supabase migration `rls002_lockdown_chat` | (DB migration, not a git commit) | Applied & verified live |
| CUST-001 | `backend/app/routers/customer.py` | `aec18a8` | Render `live` |
| CREDIT-001 | `backend/app/schemas.py`, `backend/app/routers/merchant.py` | `b54df99`, `2494973` | Render `live` |
| B2B-001 | `backend/app/routers/merchant_network.py` | `d9cb01c` | Render `live` |

Post-deploy checks performed for every fix: Render error logs reviewed for the deploy window (no new errors beyond a pre-existing, unrelated background-worker startup warning), and each fix's logic independently re-verified (RLS fixes via a fresh `pg_policies` query showing zero rows; CUST-001/CREDIT-001/B2B-001 via local reproduction of the exact previously-failing/exploitable request against the corrected code).

*Per the audit brief, this pass only applied fixes for the 5 Critical/High findings; the remaining 5 Medium/Low findings are documented above and awaiting a follow-up fix pass.*
