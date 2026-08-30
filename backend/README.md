# AK-LOGIC AI — Backend (FastAPI + PostgreSQL)

Handles OTP delivery, and — since the RLS hardening in Phase 2 (see
`../PHASE2_RLS_LOCKDOWN.md`) — every merchant register/login/profile/plan
write and every admin merchant-management action. It connects directly to
the same Postgres database Supabase provides, using a role that bypasses
RLS (see "Database connection" below); Supabase's PostgREST/anon-key path
is used by the frontend only for `merchants_public` (QR-scan lookups),
`billing_requests`, and `invoices`.

## Stack
- FastAPI (async)
- SQLAlchemy 2.0 (async, raw parameterized SQL via `merchant_repo.py` —
  no ORM models for `merchants`, since its schema is owned by the
  `supabase/migrations/*.sql` files, not this backend)
- PostgreSQL (the same database as your Supabase project)
- Pydantic v2 schemas
- JWT auth (merchant + admin realms, fully separate — a token from one
  realm is rejected on the other's routes)

## Multi-worker-safe OTP / lockout / rate-limit state

OTP codes, login lockout counters, and per-IP rate limits are stored in
Postgres (`public.auth_rate_state`, auto-created at startup — see
`app/rate_limit_repo.py` and `supabase/migrations/0009_auth_rate_state.sql`),
not in in-process memory. This means all of this state is correctly
shared across every Uvicorn/Gunicorn worker and every backend instance —
running `uvicorn app.main:app --workers 4`, multiple instances behind a
load balancer, or rolling deploys all behave identically to a single
process. No extra infrastructure (e.g. Redis) is required; it reuses the
existing `DATABASE_URL` connection.

## Database connection

`DATABASE_URL` must be the Supabase project's **direct** Postgres
connection using the `postgres` role (Supabase dashboard → Project
Settings → Database → Connection string → URI) — not the pooled
`anon`/`authenticated` roles. That role has `BYPASSRLS`, required because
`public.merchants`' RLS denies everyone else (migration `0005`).

```bash
pip install -r requirements.txt
export DATABASE_URL=postgresql+asyncpg://postgres:<password>@<project-ref>.supabase.co:5432/postgres
export JWT_SECRET=$(python -c "import secrets; print(secrets.token_urlsafe(48))")
uvicorn app.main:app --reload
```

See `.env.example` for the full list of variables.

## OTP delivery (MSG91)
OTP generation, TTL, resend cooldown, per-phone attempt lockout and
verification all live in this backend (`app/rate_limit_repo.py`) and are
unaffected by which SMS provider is configured. MSG91 is used purely as
the delivery transport, via the official MSG91 Send OTP API — MSG91's own
OTP-verify endpoint is never called.

All configuration is environment-variable driven (see `.env.example`);
nothing is ever hardcoded:

| Variable | Required | Description |
|---|---|---|
| `MSG91_AUTH_KEY` | Yes (prod) | MSG91 dashboard → Settings → API → Auth Key. Falls back to `OTP_PROVIDER_API_KEY` if unset. |
| `MSG91_TEMPLATE_ID` | Yes (prod) | Approved MSG91 "Send OTP" DLT template id. |
| `MSG91_SENDER_ID` | No | 6-character DLT-approved sender id; MSG91 uses the template's configured sender when blank. |
| `MSG91_DLT_ENTITY_ID` | No | TRAI/DLT Entity ID, only needed if MSG91 support confirms your account requires it on every send. |
| `MSG91_DLT_TE_ID` | No | TRAI/DLT Template/Header ID, same caveat as above. |
| `MSG91_OTP_EXPIRY_MINUTES` | No (default `5`) | Expiry MSG91 is told to apply on its side; this backend's own TTL remains authoritative for `/verify-otp`. |

If `MSG91_AUTH_KEY` or `MSG91_TEMPLATE_ID` is missing, the backend never
crashes — it automatically falls back to **OTP Development Mode**
(`ENVIRONMENT != production` only): a real random code is generated and
returned directly in the `/send-otp` response so local/preview
environments stay usable without an MSG91 account. In production with
MSG91 unconfigured, `/send-otp` fails closed with `{"ok": false, ...}`
rather than silently pretending success.

Structured (single-line JSON) log events are emitted for `otp_send_success`,
`otp_verify_success`, `otp_provider_error` and `otp_dev_mode_fallback` —
phone numbers are masked and OTP codes are never logged.

## Environment variables (production)
Local/dev works with no `.env` at all — every setting has a safe dev
default (see `app/config.py`). When `ENVIRONMENT=production`, the app
**fails fast at startup** (refuses to boot) unless the following are set
to real, non-default values:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | See "Database connection" above. |
| `JWT_SECRET` | Signs merchant/admin JWTs. Must not be the `change-me-in-prod` default. |
| `SECRET_KEY` | General app secret. Must not be the `your_secret_key_here` default. |
| `ADMIN_PASSWORD_HASH` | bcrypt hash of the admin password (`/api/admin/login` checks against this). |
| `FRONTEND_ORIGIN` | Comma-separated allowed CORS origin(s), e.g. `https://app.aklogic.ai`. Wildcard CORS is only used in development. |

`ENVIRONMENT=production` must be set explicitly — it defaults to
`development`, which keeps the wildcard CORS + weak-default checks off for
local work.

## API surface (as actually implemented)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /send-otp | — | Send OTP (SMS via MSG91 if configured, else dev-mode response) |
| POST | /verify-otp | — | Verify OTP, 5-attempt lockout |
| POST | /api/merchant/register | — | Register merchant, hash MPIN (bcrypt), issue merchant JWT |
| POST | /api/merchant/login | — | Phone+MPIN login, 5-attempt/15-min lockout, issues merchant JWT |
| GET  | /api/merchant/me | merchant JWT | Current merchant profile |
| PATCH| /api/merchant/me | merchant JWT | Self-service profile edit (server-side field allowlist) |
| POST | /api/merchant/change-mpin | merchant JWT | Change MPIN |
| POST | /api/merchant/purchase-plan | merchant JWT | Buy/renew a plan (server-computed carry-forward + validity) |
| POST | /api/merchant/extend-validity | merchant JWT | +30 day validity add-on |
| POST | /api/merchant/consume-credit | merchant JWT | Atomic PDF-credit deduction (invoice generation gate) |
| POST | /api/admin/login | — | Admin password login, issues admin JWT |
| POST | /api/admin/otp/verify | — | Dev-only demo admin OTP bypass (disabled when `ENVIRONMENT=production`) |
| GET  | /api/admin/merchants | admin JWT | List all merchants |
| PATCH| /api/admin/merchants/{id} | admin JWT | Admin edit (status/KYC/plan/credits/branding/profile — server-side allowlist) |

Merchant self-service data not covered above — billing requests, invoices,
QR-code lookups — is still read/written by the frontend directly against
Supabase (`merchants_public`, `billing_requests`, `invoices`); see
`../PHASE2_RLS_LOCKDOWN.md` §5 for why that wasn't brought into this
backend too.
