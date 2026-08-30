-- 0031_mcp_access_tokens.sql
-- Remote MCP (Claude), ChatGPT Custom Actions, and Sarvam AI Token Store
-- Hardened RLS & Enterprise Security Model for ak-logic-ai-saas PostgreSQL database.
-- Idempotent, safe, and non-destructive.

-- 1. Create table if not exists
CREATE TABLE IF NOT EXISTS public.mcp_access_tokens (
  id TEXT PRIMARY KEY,
  token TEXT UNIQUE NOT NULL,
  merchant_id TEXT NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  label TEXT DEFAULT 'Claude Connector',
  revoked BOOLEAN NOT NULL DEFAULT false,
  created_at BIGINT NOT NULL,
  last_used_at BIGINT
);

-- 2. Ensure columns exist if table was previously created with minimal schema
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'mcp_access_tokens' AND column_name = 'label'
  ) THEN
    ALTER TABLE public.mcp_access_tokens ADD COLUMN label TEXT DEFAULT 'Claude Connector';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'mcp_access_tokens' AND column_name = 'revoked'
  ) THEN
    ALTER TABLE public.mcp_access_tokens ADD COLUMN revoked BOOLEAN NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'mcp_access_tokens' AND column_name = 'last_used_at'
  ) THEN
    ALTER TABLE public.mcp_access_tokens ADD COLUMN last_used_at BIGINT;
  END IF;
END $$;

-- 3. Indexes for O(1) token verification and merchant lookup
CREATE INDEX IF NOT EXISTS idx_mcp_tokens_token ON public.mcp_access_tokens(token);
CREATE INDEX IF NOT EXISTS idx_mcp_tokens_merchant ON public.mcp_access_tokens(merchant_id);
CREATE INDEX IF NOT EXISTS idx_mcp_tokens_revoked ON public.mcp_access_tokens(revoked);

-- 4. Enable & Force Row Level Security (RLS)
ALTER TABLE public.mcp_access_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_access_tokens FORCE ROW LEVEL SECURITY;

-- 5. Revoke direct public/client access from anon and authenticated roles
-- (Completely blocks direct client-side PostgREST / browser scraping)
REVOKE ALL ON public.mcp_access_tokens FROM anon;
REVOKE ALL ON public.mcp_access_tokens FROM authenticated;

-- 6. Hardened RLS Policy (Service Role Full Access)
-- Only serverless functions holding SUPABASE_SERVICE_ROLE_KEY or database superusers can read/write
DROP POLICY IF EXISTS "mcp_tokens_service_role_policy" ON public.mcp_access_tokens;
CREATE POLICY "mcp_tokens_service_role_policy" ON public.mcp_access_tokens
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
