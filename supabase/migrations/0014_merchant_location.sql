-- Migration 0014: Merchant Location
-- Additive only. Adds nullable coordinates to merchants for Nearby Merchant Intelligence (Phase 4).
-- Fully backward compatible.

ALTER TABLE public.merchants
    ADD COLUMN IF NOT EXISTS latitude numeric,
    ADD COLUMN IF NOT EXISTS longitude numeric;
