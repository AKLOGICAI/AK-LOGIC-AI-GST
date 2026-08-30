-- 0026_merchant_signatures_private_storage.sql
-- Create Private Bucket for Signatures & Seals with Restricted Access

insert into storage.buckets (id, name, public)
values ('merchant-signatures', 'merchant-signatures', false)
on conflict (id) do update set public = false;

drop policy if exists "Service Role Access for Merchant Signatures" on storage.objects;
create policy "Service Role Access for Merchant Signatures"
  on storage.objects for all
  using (
    bucket_id = 'merchant-signatures' 
    and auth.role() = 'service_role'
  );
