-- 0029_primary_merchant.sql
-- Module 2: Primary Merchant System for Customer Vault

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS "primaryMerchantId" text REFERENCES public.merchants(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_customers_primary_merchant ON public.customers("primaryMerchantId");

CREATE TABLE IF NOT EXISTS public.customer_primary_merchant_logs (
    id text PRIMARY KEY,
    "customerId" text NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    "previousMerchantId" text REFERENCES public.merchants(id) ON DELETE SET NULL,
    "newMerchantId" text REFERENCES public.merchants(id) ON DELETE SET NULL,
    "action" text NOT NULL, -- 'set' | 'change' | 'remove'
    "changedAt" bigint NOT NULL,
    "ipAddress" text
);

CREATE INDEX IF NOT EXISTS idx_pm_logs_customer ON public.customer_primary_merchant_logs("customerId");
