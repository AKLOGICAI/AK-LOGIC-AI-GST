-- Migration 0013: HSN Learning Signals
-- Additive only — no existing table is touched.
-- Stores merchant-approved HSN/SAC selections so the AI suggestion engine
-- can learn from real invoice data across devices and sessions.
--
-- RLS lockdown: same pattern as 0012_merchant_network.sql — enabled + forced,
-- zero open policies, backend-only access via service role.

-- ==========================================
-- 1. Create Table
-- ==========================================

CREATE TABLE IF NOT EXISTS public.hsn_learning_signals (
    id text PRIMARY KEY,
    merchant_id text NOT NULL REFERENCES public.merchants(id),
    normalized_item_name text NOT NULL,
    sample_item_name text,
    hsn text NOT NULL,
    gst_rate numeric NOT NULL,
    approve_count integer NOT NULL DEFAULT 1,
    override_count integer NOT NULL DEFAULT 0,
    first_seen_at bigint NOT NULL,
    last_seen_at bigint NOT NULL
);

-- ==========================================
-- 2. Indexes
-- ==========================================

CREATE INDEX IF NOT EXISTS idx_hsn_learning_merchant
    ON public.hsn_learning_signals(merchant_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_hsn_learning_signal
    ON public.hsn_learning_signals(merchant_id, normalized_item_name, hsn, gst_rate);

-- ==========================================
-- 3. Row Level Security & Lockdown
-- ==========================================

ALTER TABLE public.hsn_learning_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hsn_learning_signals FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.hsn_learning_signals FROM anon;
REVOKE ALL ON public.hsn_learning_signals FROM authenticated;
