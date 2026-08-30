-- Company Seal — purely additive column for the Company Seal UI feature.
-- =============================================================================
-- Mirrors "logoDataUrl" / "signatureDataUrl" exactly: a single nullable
-- text column that stores an image data URL (either an uploaded seal file
-- or a system-generated circular seal). Nothing else about the merchants
-- table, its RLS policies, or any other table is touched.
--
-- Does NOT change: GST engine, invoice numbering, invoice approval flow,
-- payment workflow, RLS policies, any API contract other than this one
-- new optional field, or any other business logic.
--
-- Safe to run against a fresh project or re-run against an existing one
-- (idempotent: guarded with IF NOT EXISTS, same as 0006).

alter table public.merchants
  add column if not exists "companySealDataUrl" text;

-- Expose it on the customer-facing/public view too? Not needed — the
-- Company Seal is only ever rendered on invoice PDFs that already flow
-- entirely through the merchant's own authenticated session and the
-- backend's invoice-generation payload, never through merchants_public.
-- (See supabase/migrations/0005_merchants_lockdown.sql / 0006's own view
-- definition — intentionally left unchanged here.)
