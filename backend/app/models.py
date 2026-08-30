"""SQLAlchemy ORM models.

HISTORY / WHY THIS FILE IS NOW EMPTY OF TABLE DEFINITIONS:

This file used to define a second, parallel `merchants` schema (plus
billing_requests, invoices, subscriptions, recharge_history, notifications,
address_book, support_tickets, admin_audit_logs) using snake_case columns
(e.g. `account_number`), pointed at `settings.database_url` — a *different*
physical database from the one the frontend actually uses.

Audit finding: the live frontend never calls any endpoint that touched
these models. Every merchant-data read/write in the app goes directly
from the browser to Supabase via `@supabase/supabase-js`
(see src/lib/services.ts, src/lib/supabase.ts), using the camelCase,
quoted-identifier schema defined in supabase/migrations/. The routes that
depended on this file (backend/app/routers/merchant.py,
backend/app/routers/public.py, and the non-auth endpoints that used to
live in admin.py) were unreachable dead code — confirmed by grepping the
entire frontend for calls to them and finding none.

Keeping two independently-maintained schemas for the same conceptual
table under two different naming conventions, in two different
databases, is exactly what caused the "accountNumber vs account_number"
confusion and the PGRST204 debugging session. Rather than translate the
snake_case convention to camelCase and keep a second, still-disconnected
database in sync by hand, this dead schema has been removed outright.

Supabase (via the SQL in supabase/migrations/, camelCase, quoted
identifiers) is the single canonical schema for merchant, invoice, and
billing data in this project. If a real backend-owned table is ever
needed again (e.g. to move writes off the anon key — see
supabase/migrations/0002_merchants_rls_hardening.sql, Option A), define
it here using the SAME camelCase column names as Supabase and point
`database_url` at the SAME Supabase Postgres connection string, so there
is only ever one schema, not two.
"""

from .database import Base  # noqa: F401  (kept so `Base` remains importable)
