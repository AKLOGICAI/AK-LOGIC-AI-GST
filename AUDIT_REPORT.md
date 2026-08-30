# GST Invoice Platform — Final Production Audit Report
**Type:** Read-only static code audit (no files modified)
**Scope:** Backend (FastAPI), Frontend (React/Vite), Supabase migrations, deployment config

---

## 1. SECURITY

| Area | Finding | File(s) | Severity |
|---|---|---|---|
| SQL Injection | All queries use parameterized SQLAlchemy `text()` with bound params and explicit column allowlists. No string-interpolated user input reaches SQL. | `backend/app/merchant_repo.py`, `billing_repo.py`, `payment_repo.py` | No verified issue found |
| Authentication / Authorization | Separate JWT realms (`merchant` / `admin`); realm + signature checked on every protected route via `Depends(require_merchant/require_admin)`. | `backend/app/security.py` | No verified issue found |
| Admin dev-OTP backdoor | Hardcoded `123456` OTP path exists in shipped code, disabled only by a runtime `if settings.environment == "production"` check. | `backend/app/routers/admin.py` (`/otp/verify`) | **Medium** |
| JWT handling | HS256, realm claim enforced, `exp` set from config TTL. No algorithm-confusion or missing-verification issues found. | `backend/app/security.py` | No verified issue found |
| RLS compatibility | `enable + force row level security`, open policies dropped, `revoke all` from `anon`/`authenticated` on `merchants`, `billing_requests`, `invoices`, `payment_orders`. Matches backend's BYPASSRLS connection design. | `supabase/migrations/0005_*.sql`, `0007_*.sql`, `0008_*.sql` | No verified issue found |
| Payment verification flow | `/verify-payment` fails closed if `RAZORPAY_KEY_SECRET` unset; HMAC-SHA256 checked with `hmac.compare_digest`; order consumption is one atomic `UPDATE ... WHERE status='paid' AND consumed=false`. | `backend/app/routers/merchant.py`, `payment_repo.py` | No verified issue found |
| Razorpay integration | Real signature scheme implemented correctly; no live keys found hardcoded anywhere in the codebase. | `backend/app/routers/merchant.py` | No verified issue found |
| Sensitive data exposure | `mpin` digest stripped from every response (`_public_merchant()`); `merchants_public` view exposes only non-sensitive columns to the anon key. | `backend/app/routers/merchant.py`, `supabase/migrations/0005_*.sql` | No verified issue found |
| Invoice tax totals not server-validated | `backend/app/gst_engine.py` (a full Python port of the GST calculation) exists but is **never imported anywhere**. `POST /api/merchant/invoices` accepts `taxableValue/cgst/sgst/igst/grandTotal` directly from the client and persists them without recomputing from `items`. | `backend/app/schemas.py` (`InvoiceApproveIn`), `routers/billing.py`, `gst_engine.py` (dead) | **Medium** |
| XSS | No `dangerouslySetInnerHTML` on user-controlled data — the only usage is a static hardcoded SVG constant. React JSX escaping used throughout. | `src/pages/admin/AdminLogo.tsx` | No verified issue found |
| CSP | Real CSP is set, but `script-src` includes `'unsafe-inline'`, and `connect-src` hardcodes a specific backend origin that must be manually kept in sync with `VITE_API_BASE`. | `vercel.json` | **Medium** |
| CSRF | Bearer-token auth only, `allow_credentials=False` in CORS, no cookie-based sessions — classic CSRF does not apply to this architecture. | `backend/app/main.py` | No verified issue found |
| Rate limiting | Per-IP/per-phone throttles exist for OTP, merchant login, admin login, and billing-request creation — but all are plain in-process Python `dict`s, not shared across workers/instances. | `backend/app/main.py`, `routers/merchant.py`, `routers/admin.py`, `routers/billing.py` | **High** |
| Privilege escalation | `MERCHANT_SELF_EDITABLE_FIELDS` vs `ADMIN_EDITABLE_FIELDS` allowlists correctly exclude credits/plan/status from merchant self-edit; ownership re-checked server-side (`SELECT ... FOR UPDATE`) on every billing write. | `backend/app/merchant_repo.py`, `billing_repo.py` | No verified issue found |

**Security Score: 83 / 100**

---

## 2. BACKEND

| Area | Finding | File(s) | Severity |
|---|---|---|---|
| FastAPI routers | Clean separation of public/merchant/admin routers, consistent auth gating. | `backend/app/routers/*.py` | No verified issue found |
| Repository layer | Explicit column allowlists everywhere — no arbitrary field injection via patch dicts. | `merchant_repo.py`, `billing_repo.py` | No verified issue found |
| Error handling | Generic 500s on unexpected DB errors; no stack traces leaked to the client. | `routers/merchant.py`, `routers/admin.py` | No verified issue found |
| Transactions / race conditions | Invoice approval and credit consumption are both atomic (`SELECT ... FOR UPDATE`, single `UPDATE ... WHERE ... RETURNING`). Payment order consumption prevents double-spend. | `billing_repo.py`, `merchant_repo.py`, `payment_repo.py` | No verified issue found |
| Invoice creation flow — credit burned without invoice | `invoiceService.approve()` consumes a PDF credit first, then calls `/api/merchant/invoices` separately. If that second call fails (network drop / backend error) after the credit deduction succeeds, there is no refund/rollback — the merchant loses a credit with no invoice created. | `src/lib/services.ts` (`invoiceService.approve`) | **Medium** |
| Billing request flow | Correctly transactional; a request can only be approved once, only by its owning merchant. | `billing_repo.py` (`approve_request_with_invoice`) | No verified issue found |
| Payment flow | Order creation, verification, and consumption are properly separated and atomic. | `routers/merchant.py`, `payment_repo.py` | No verified issue found |
| Startup configuration | Fails fast in production if JWT secret/admin hash/CORS origin are missing or default — logic verified correct. | `backend/app/config.py` | No verified issue found |
| Dead code | `backend/app/plans.py` (datetime-based plan catalog) and `gst_engine.py` are unused/unimported anywhere; `models.py` is an intentionally emptied legacy file. | `backend/app/plans.py`, `gst_engine.py`, `models.py` | **Low** |

---

## 3. FRONTEND

| Area | Finding | File(s) | Severity |
|---|---|---|---|
| API integration | Single `apiClient.ts` wrapper, consistent error surfacing (`ApiError` / `ApiUnavailableError`). | `src/lib/apiClient.ts` | No verified issue found |
| State management / cache consistency | Backend responses are upserted into the local cache after every write (`db.invoices.upsert`, `db.requests.upsert`) — consistent pattern across the app. | `src/lib/services.ts` | No verified issue found |
| Token storage | JWT stored in `localStorage` via an AES wrapper. Self-documented as "at-rest obfuscation, not XSS protection" — if `VITE_ENCRYPTION_KEY` is unset, a random key is generated and stored in plain `localStorage` next to the encrypted data. | `src/lib/secureStorage.ts` | **Medium** (architectural tradeoff of a cookie-less SPA, not a bug) |
| Polling | `InvoiceStatus.tsx` polls every 5s only while status is `pending`; interval is cleaned up correctly on unmount/status change. | `src/pages/InvoiceStatus.tsx` | No verified issue found |
| Error handling / loading states | Consistent try/catch with fail-closed UI messaging throughout. | `src/lib/services.ts` | No verified issue found |
| Invoice status flow | Correct capability-style (unguessable ID) lookups for the no-login customer flow — never a bulk scan. | `src/pages/InvoiceStatus.tsx`, `backend/app/routers/billing.py` | No verified issue found |
| Merchant / Admin / Customer flows | All three route through the hardened backend paths established by the RLS migrations. | `src/lib/services.ts`, `backend/app/routers/*.py` | No verified issue found |

---

## 4. PRODUCTION READINESS

- **Environment variables**: `.env.example` (root + backend) complete and documented. No real secrets committed to the repo (verified — no `.env` file, no live key patterns found).
- **Build readiness**: Confirmed already by prior verification steps (not re-run here — read-only audit).
- **Deployment readiness**: `vercel.json` sets solid security headers (HSTS, X-Frame-Options, nosniff). CSP has the `unsafe-inline` / hardcoded-origin caveats noted above.
- **Performance**: `weasyprint` and `qrcode[pil]` are declared in `backend/requirements.txt` but are **not used anywhere in the backend code** (verified) — unnecessary heavy native dependencies that add build/deploy weight for no benefit.
- **Remaining risks, ranked**:
  1. **High** — In-memory OTP store / rate limits / login lockouts are per-process; they will silently stop working correctly under multi-worker or multi-instance deployment.
  2. **Medium** — Invoice tax totals are trusted from the client with no server-side recomputation (`gst_engine.py` exists but is unused).
  3. **Medium** — Credit-consumed-but-no-invoice window on partial request failure, no compensation logic.
  4. **Medium** — Dev admin-OTP backdoor ships in production code, gated only by an environment variable being set correctly.
  5. **Medium** — CSP allows `unsafe-inline` scripts and hardcodes the backend origin.
  6. **Low** — Dead code (`plans.py`, `gst_engine.py`, unused pip packages) — maintenance/drift risk only.

---

## FINAL SCORES

- **Production Readiness Score: 78 / 100**
- **Security Score: 83 / 100**
- **Overall Verdict: READY WITH MINOR FIXES**

The core security architecture — RLS lockdown, JWT realm separation, HMAC payment verification, and atomic credit/invoice transactions — is solid and matches what the code's own comments claim. The open items above are real and verifiable but bounded: primarily a horizontal-scaling gap (#1) and two compliance/data-integrity gaps (#2, #3) worth closing before high-volume production traffic — none of them block a controlled initial launch.
