-- 0030_deliveries.sql
-- Module 6: Parcel / Delivery and Order Logistics Module

CREATE TABLE IF NOT EXISTS public.deliveries (
    id text PRIMARY KEY,
    merchant_id text NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
    invoice_id text REFERENCES public.invoices(id) ON DELETE SET NULL,
    order_ref text DEFAULT '',
    status text NOT NULL DEFAULT 'pending', -- 'pending' | 'picked' | 'in_transit' | 'delivered' | 'failed'
    address text NOT NULL,
    recipient_name text NOT NULL,
    recipient_phone text NOT NULL,
    courier_name text DEFAULT '',
    tracking_ref text DEFAULT '',
    pickup_time bigint,
    delivered_at bigint,
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_deliv_merchant ON public.deliveries(merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deliv_invoice ON public.deliveries(invoice_id);
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliveries FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.deliveries FROM anon;
REVOKE ALL ON public.deliveries FROM authenticated;

CREATE TABLE IF NOT EXISTS public.delivery_status_events (
    id text PRIMARY KEY,
    delivery_id text NOT NULL REFERENCES public.deliveries(id) ON DELETE CASCADE,
    status text NOT NULL,
    notes text DEFAULT '',
    updated_by text DEFAULT '',
    created_at bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_deliv_events ON public.delivery_status_events(delivery_id, created_at ASC);
ALTER TABLE public.delivery_status_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_status_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.delivery_status_events FROM anon;
REVOKE ALL ON public.delivery_status_events FROM authenticated;
