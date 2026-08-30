-- Migration 0012: Merchant Network (Module A)
-- Idempotent and additive. Sets up B2B marketplace tables.
-- Strict RLS lockdown pattern applied to all new tables (enabled + forced, zero open policies, backend-only bypass).

-- ==========================================
-- 1. Create Tables
-- ==========================================

-- MODULE A: Merchant Network Requests
CREATE TABLE IF NOT EXISTS public.merchant_network_requests (
    id text PRIMARY KEY,
    requester_merchant_id text NOT NULL REFERENCES public.merchants(id),
    product_name text NOT NULL,
    quantity numeric NOT NULL,
    unit text NOT NULL,
    urgency text NOT NULL DEFAULT 'normal', -- 'normal' | 'urgent'
    status text NOT NULL DEFAULT 'open', -- 'open' | 'responded' | 'accepted' | 'confirmed' | 'completed' | 'cancelled'
    city text,
    pincode text,
    state text,
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL
);

-- MODULE A: Merchant Network Responses
CREATE TABLE IF NOT EXISTS public.merchant_network_responses (
    id text PRIMARY KEY,
    request_id text NOT NULL REFERENCES public.merchant_network_requests(id) ON DELETE CASCADE,
    responder_merchant_id text NOT NULL REFERENCES public.merchants(id),
    availability text NOT NULL, -- 'available' | 'not_available'
    created_at bigint NOT NULL
);

-- MODULE A: Merchant Network Orders
CREATE TABLE IF NOT EXISTS public.merchant_network_orders (
    id text PRIMARY KEY,
    request_id text NOT NULL REFERENCES public.merchant_network_requests(id),
    buyer_merchant_id text NOT NULL REFERENCES public.merchants(id),
    seller_merchant_id text NOT NULL REFERENCES public.merchants(id),
    delivery_mode text NOT NULL, -- 'self_pickup' | 'delivery_partner'
    buyer_confirmed_at bigint,
    seller_confirmed_at bigint,
    status text NOT NULL, -- e.g. 'pending' | 'accepted' | 'confirmed' | 'completed' | 'cancelled'
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL
);

-- MODULE A: Merchant Network Messages
CREATE TABLE IF NOT EXISTS public.merchant_network_messages (
    id text PRIMARY KEY,
    order_id text REFERENCES public.merchant_network_orders(id),
    request_id text REFERENCES public.merchant_network_requests(id),
    sender_merchant_id text NOT NULL REFERENCES public.merchants(id),
    body text NOT NULL,
    created_at bigint NOT NULL
);

-- MODULE A: Merchant Network Activity Log
CREATE TABLE IF NOT EXISTS public.merchant_network_activity_log (
    id text PRIMARY KEY,
    actor_merchant_id text NOT NULL REFERENCES public.merchants(id),
    request_id text REFERENCES public.merchant_network_requests(id),
    order_id text REFERENCES public.merchant_network_orders(id),
    action text NOT NULL,
    meta jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at bigint NOT NULL
);

-- MODULE A: Merchant Trust Metrics
CREATE TABLE IF NOT EXISTS public.merchant_trust_metrics (
    id text PRIMARY KEY,
    merchant_id text NOT NULL UNIQUE REFERENCES public.merchants(id),
    trust_score numeric,
    successful_transactions integer NOT NULL DEFAULT 0,
    response_rate numeric,
    cancellation_rate numeric,
    updated_at bigint NOT NULL
);

-- MODULE A: Network Notifications
CREATE TABLE IF NOT EXISTS public.network_notifications (
    id text PRIMARY KEY,
    recipient_merchant_id text NOT NULL REFERENCES public.merchants(id),
    event_type text NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    related_request_id text REFERENCES public.merchant_network_requests(id),
    related_order_id text REFERENCES public.merchant_network_orders(id),
    read boolean NOT NULL DEFAULT false,
    created_at bigint NOT NULL
);

-- MODULE A: Network Feature Flags
CREATE TABLE IF NOT EXISTS public.network_feature_flags (
    id text PRIMARY KEY,
    flag_key text NOT NULL UNIQUE,
    enabled boolean NOT NULL DEFAULT false,
    updated_by_admin_id text,
    updated_at bigint NOT NULL
);

-- ==========================================
-- 2. Indexes
-- ==========================================

-- Merchant Network Indexes
CREATE INDEX IF NOT EXISTS merchant_network_reqs_requester_idx ON public.merchant_network_requests(requester_merchant_id);
CREATE INDEX IF NOT EXISTS merchant_network_reqs_status_idx ON public.merchant_network_requests(status);
CREATE INDEX IF NOT EXISTS merchant_network_resps_req_idx ON public.merchant_network_responses(request_id);
CREATE INDEX IF NOT EXISTS merchant_network_resps_merch_idx ON public.merchant_network_responses(responder_merchant_id);
CREATE INDEX IF NOT EXISTS merchant_network_orders_req_idx ON public.merchant_network_orders(request_id);
CREATE INDEX IF NOT EXISTS merchant_network_orders_buyer_idx ON public.merchant_network_orders(buyer_merchant_id);
CREATE INDEX IF NOT EXISTS merchant_network_orders_seller_idx ON public.merchant_network_orders(seller_merchant_id);
CREATE INDEX IF NOT EXISTS merchant_network_messages_order_idx ON public.merchant_network_messages(order_id);
CREATE INDEX IF NOT EXISTS merchant_network_messages_req_idx ON public.merchant_network_messages(request_id);
CREATE INDEX IF NOT EXISTS network_notifications_recipient_idx ON public.network_notifications(recipient_merchant_id);
CREATE INDEX IF NOT EXISTS network_notifications_read_idx ON public.network_notifications(read);

-- ==========================================
-- 3. Row Level Security & Lockdown
-- ==========================================

DO $$
DECLARE
    t text;
    tables_list text[] := ARRAY[
        'merchant_network_requests',
        'merchant_network_responses',
        'merchant_network_orders',
        'merchant_network_messages',
        'merchant_network_activity_log',
        'merchant_trust_metrics',
        'network_notifications',
        'network_feature_flags'
    ];
BEGIN
    FOREACH t IN ARRAY tables_list LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
        EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
        EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', t);
    END LOOP;
END $$;

-- ==========================================
-- 4. Seed Data
-- ==========================================

INSERT INTO public.network_feature_flags (id, flag_key, enabled, updated_by_admin_id, updated_at)
VALUES (
    'flag_merchant_network_enabled',
    'merchant_network_enabled',
    false,
    NULL,
    (extract(epoch from now()) * 1000)::bigint
)
ON CONFLICT (flag_key) DO NOTHING;
