-- Migration 0019: Merchant Network Features
-- 1. Adds cancellation_reason to merchant_network_orders for cancellation tracking.
-- 2. Adds image_url to merchant_network_messages for photo attachments in chat.
-- 3. Creates merchant_network_reviews table for trust score ratings & feedback.
-- 4. Creates merchant_network_disputes table for reporting issues & admin flags.

-- 1. Order Cancellation Reason
alter table public.merchant_network_orders
  add column if not exists cancellation_reason text;

-- 2. Chat Image Attachment
alter table public.merchant_network_messages
  add column if not exists image_url text;

-- 3. Ratings & Reviews Table
create table if not exists public.merchant_network_reviews (
  id text primary key,
  order_id text not null,
  reviewer_merchant_id text not null,
  reviewee_merchant_id text not null,
  rating integer not null check (rating >= 1 and rating <= 5),
  comment text,
  created_at bigint not null
);

create index if not exists reviews_order_idx on public.merchant_network_reviews (order_id);
create index if not exists reviews_reviewee_idx on public.merchant_network_reviews (reviewee_merchant_id);

alter table public.merchant_network_reviews enable row level security;
alter table public.merchant_network_reviews force row level security;
revoke all on public.merchant_network_reviews from anon;
revoke all on public.merchant_network_reviews from authenticated;

-- 4. Disputes & Issue Reporting Table
create table if not exists public.merchant_network_disputes (
  id text primary key,
  order_id text not null,
  reporter_merchant_id text not null,
  target_merchant_id text not null,
  reason text not null,               -- 'no_response' | 'wrong_quantity_quality' | 'suspected_fraud' | 'other'
  details text,
  status text not null default 'open', -- 'open' | 'investigating' | 'resolved' | 'dismissed'
  created_at bigint not null,
  resolved_at bigint
);

create index if not exists disputes_order_idx on public.merchant_network_disputes (order_id);
create index if not exists disputes_status_idx on public.merchant_network_disputes (status);

alter table public.merchant_network_disputes enable row level security;
alter table public.merchant_network_disputes force row level security;
revoke all on public.merchant_network_disputes from anon;
revoke all on public.merchant_network_disputes from authenticated;
