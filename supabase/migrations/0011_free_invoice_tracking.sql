-- 0011: Add free-invoice-per-24h tracking column
--
-- Every merchant gets 1 free PDF invoice every 24 hours, independent of
-- their paid plan/credits. This column tracks when they last used it.
-- NULL or 0 = never used (first free invoice available immediately).

ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS "lastFreeInvoiceAt" bigint DEFAULT NULL;

COMMENT ON COLUMN public.merchants."lastFreeInvoiceAt"
  IS 'Epoch-ms timestamp of last free-invoice usage. NULL = never used.';
