-- 0028_accounting_core.sql
-- Double-Entry Accounting Core: Chart of Accounts, Journal Entries, and Journal Lines.

CREATE TABLE IF NOT EXISTS public.chart_of_accounts (
    id text PRIMARY KEY,
    merchant_id text NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
    code text NOT NULL,
    name text NOT NULL,
    type text NOT NULL, -- 'asset' | 'liability' | 'equity' | 'income' | 'expense'
    parent_id text,
    is_system boolean DEFAULT false,
    description text DEFAULT '',
    created_at bigint NOT NULL,
    CONSTRAINT uq_merchant_account_code UNIQUE (merchant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_coa_merchant ON public.chart_of_accounts(merchant_id);
ALTER TABLE public.chart_of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chart_of_accounts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.chart_of_accounts FROM anon;
REVOKE ALL ON public.chart_of_accounts FROM authenticated;

CREATE TABLE IF NOT EXISTS public.journal_entries (
    id text PRIMARY KEY,
    merchant_id text NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
    entry_date text NOT NULL,
    narration text DEFAULT '',
    source_type text NOT NULL, -- 'purchase' | 'invoice' | 'reversal' | 'manual'
    source_id text NOT NULL,
    is_reversed boolean DEFAULT false,
    reversed_by_id text,
    created_at bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_je_merchant ON public.journal_entries(merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_je_source ON public.journal_entries(source_type, source_id);
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.journal_entries FROM anon;
REVOKE ALL ON public.journal_entries FROM authenticated;

CREATE TABLE IF NOT EXISTS public.journal_lines (
    id text PRIMARY KEY,
    journal_entry_id text NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
    merchant_id text NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
    account_id text NOT NULL REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
    debit numeric DEFAULT 0,
    credit numeric DEFAULT 0,
    party_type text, -- 'supplier' | 'customer' | null
    party_ref text DEFAULT '',
    created_at bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_jl_entry ON public.journal_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_jl_account ON public.journal_lines(account_id);
CREATE INDEX IF NOT EXISTS idx_jl_merchant_party ON public.journal_lines(merchant_id, party_ref);
ALTER TABLE public.journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_lines FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.journal_lines FROM anon;
REVOKE ALL ON public.journal_lines FROM authenticated;
