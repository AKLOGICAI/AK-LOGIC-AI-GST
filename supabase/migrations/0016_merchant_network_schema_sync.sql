-- Migration 0016: Merchant Network Schema Sync
-- Adds missing columns expected by the backend but omitted in initial migrations.

ALTER TABLE public.merchant_network_requests
    ADD COLUMN IF NOT EXISTS origin text,
    ADD COLUMN IF NOT EXISTS origin_customer_request_id text,
    ADD COLUMN IF NOT EXISTS match_source text;

ALTER TABLE public.merchant_network_orders
    ADD COLUMN IF NOT EXISTS delivery_provider_code text,
    ADD COLUMN IF NOT EXISTS delivery_provider_ref text;

ALTER TABLE public.merchant_trust_metrics
    ADD COLUMN IF NOT EXISTS ai_risk_score numeric;
