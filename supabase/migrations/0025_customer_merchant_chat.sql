-- 0025_customer_merchant_chat.sql
-- Production-Grade Customer <-> Merchant Unified Chat Infrastructure

-- 1. Create chat_threads table
create table if not exists public.chat_threads (
  id text primary key,
  channel_type text not null default 'b2c_inquiry',
  merchant_id text not null references public.merchants(id) on delete cascade,
  customer_id text references public.customers(id) on delete set null,
  status text not null default 'active',
  last_message_at bigint not null,
  last_message_snippet text default '',
  merchant_unread_count integer not null default 0,
  customer_unread_count integer not null default 0,
  merchant_pinned boolean not null default false,
  customer_pinned boolean not null default false,
  active_inquiry_item_id text references public.merchant_inventory(id) on delete set null,
  agreed_unit_price numeric default null,
  draft_billing_request_id text references public.billing_requests(id) on delete set null,
  created_at bigint not null,
  updated_at bigint not null
);

-- 2. Create chat_messages table
create table if not exists public.chat_messages (
  id text primary key,
  thread_id text not null references public.chat_threads(id) on delete cascade,
  sender_type text not null,
  sender_id text not null,
  msg_type text not null default 'text',
  content text not null,
  media_url text default '',
  metadata jsonb default '{}'::jsonb,
  status text not null default 'sent',
  read_at bigint default null,
  created_at bigint not null
);

-- 3. Indexes for 10M+ message scale
create index if not exists idx_threads_merchant on public.chat_threads(merchant_id, last_message_at desc);
create index if not exists idx_threads_customer on public.chat_threads(customer_id, last_message_at desc);
create index if not exists idx_messages_thread on public.chat_messages(thread_id, created_at desc);

-- 4. Enable RLS
alter table public.chat_threads enable row level security;
alter table public.chat_messages enable row level security;

-- 5. Hardened RLS Policies (Service Role Access)
drop policy if exists "Chat Threads Service Role Read" on public.chat_threads;
create policy "Chat Threads Service Role Read" on public.chat_threads for select using (true);

drop policy if exists "Chat Messages Service Role Read" on public.chat_messages;
create policy "Chat Messages Service Role Read" on public.chat_messages for select using (true);
