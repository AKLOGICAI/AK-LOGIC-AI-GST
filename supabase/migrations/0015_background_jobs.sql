-- Migration 0015: Background Jobs for Notification Escalation
-- Additive only.
-- A simple, robust job queue table for Phase 6 (Smart Notification Engine).
-- Uses Postgres SKIP LOCKED for concurrency-safe worker fetching.

CREATE TABLE IF NOT EXISTS public.background_jobs (
    id text PRIMARY KEY,
    job_type text NOT NULL, -- e.g., 'escalate_network_search'
    payload jsonb NOT NULL,
    status text NOT NULL DEFAULT 'pending', -- 'pending' | 'processing' | 'completed' | 'failed'
    run_after bigint NOT NULL, -- Epoch ms
    locked_at bigint,
    locked_by text,
    attempts integer NOT NULL DEFAULT 0,
    max_attempts integer NOT NULL DEFAULT 3,
    error_log text,
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL
);

-- Index for efficient polling of due jobs
CREATE INDEX IF NOT EXISTS idx_background_jobs_pending ON public.background_jobs (run_after) 
WHERE status = 'pending';

-- ---------------- Row Level Security ----------------
ALTER TABLE public.background_jobs ENABLE ROW LEVEL SECURITY;

-- Backend only access (bypasses RLS). No public policies needed.
