-- Migration 0027: Enforce GSTIN Uniqueness at Database Level
--
-- Description:
-- 1. Drops legacy unique constraint on phone to allow multiple business accounts under the same mobile number with different GSTINs.
-- 2. Creates a partial unique index on upper(gstin) to strictly enforce GSTIN uniqueness at the PostgreSQL database level.

-- Step 1: Relax DB-level phone uniqueness constraint
ALTER TABLE public.merchants DROP CONSTRAINT IF EXISTS merchants_phone_key;
DROP INDEX IF EXISTS public.idx_merchants_phone_unique;
CREATE INDEX IF NOT EXISTS idx_merchants_phone ON public.merchants("phone");

-- Step 2: Enforce DB-level GSTIN uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS merchants_gstin_unique_idx
ON public.merchants (upper(gstin))
WHERE gstin IS NOT NULL AND trim(gstin) <> '';
