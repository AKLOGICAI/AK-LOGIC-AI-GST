-- 0017_merchant_network_terms.sql
-- Add networkTermsAccepted column to merchants table to track Terms of Use acceptance.

ALTER TABLE public.merchants 
ADD COLUMN IF NOT EXISTS "networkTermsAccepted" BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS "networkTermsAcceptedAt" BIGINT,
ADD COLUMN IF NOT EXISTS "networkTermsVersion" TEXT;

-- The schema cache must be refreshed for PostgREST to see the new column
NOTIFY pgrst, 'reload schema';
