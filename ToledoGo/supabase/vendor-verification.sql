-- Run in Supabase SQL Editor before testing vendor document uploads.

alter table public.vendors
  add column if not exists owner_id_url text,
  add column if not exists phone text,
  add column if not exists permit_url text,
  add column if not exists store_photo_url text,
  add column if not exists profile_photo_url text,
  add column if not exists physical_address text,
  add column if not exists fulfillment_mode text default 'instore',
  add column if not exists meetup_details text,
  add column if not exists payment_qr_url text,
  add column if not exists gcash_qr_url text,
  add column if not exists maya_qr_url text,
  add column if not exists payment_account_name text,
  add column if not exists is_open boolean not null default true,
  add column if not exists verification_status text not null default 'pending',
  add column if not exists admin_notes text;

update public.vendors
set verification_status = case when is_verified then 'approved' else 'pending' end
where verification_status is null or verification_status not in ('pending', 'under_review', 'approved', 'rejected');

alter table public.vendors
  drop constraint if exists vendors_verification_status_check;

alter table public.vendors
  add constraint vendors_verification_status_check
  check (verification_status in ('pending', 'under_review', 'approved', 'rejected'));

create or replace function public.set_vendor_open_status(open_status boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.vendors
  set is_open = open_status
  where id = auth.uid();

  if not found then
    raise exception 'Vendor profile not found';
  end if;
end;
$$;

revoke all on function public.set_vendor_open_status(boolean) from public;
grant execute on function public.set_vendor_open_status(boolean) to authenticated;

drop function if exists public.update_vendor_profile(text, text, text, text, text);
drop function if exists public.update_vendor_profile(text, text, text, text, text, text);
drop function if exists public.update_vendor_profile(text, text, text, text, text, text, text, text);
drop function if exists public.update_vendor_profile(text, text, text, text, text, text, text, text, text);

create or replace function public.update_vendor_profile(
  vendor_business_name text,
  vendor_owner_name text,
  vendor_cuisine_specialty text,
  vendor_physical_address text,
  vendor_meetup_details text,
  vendor_profile_photo_url text,
  vendor_gcash_qr_url text,
  vendor_maya_qr_url text,
  vendor_payment_account_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.vendors
  set business_name = nullif(trim(vendor_business_name), ''),
      owner_name = nullif(trim(vendor_owner_name), ''),
      cuisine_specialty = nullif(trim(vendor_cuisine_specialty), ''),
      physical_address = nullif(trim(vendor_physical_address), ''),
      meetup_details = nullif(trim(vendor_meetup_details), ''),
      profile_photo_url = nullif(trim(vendor_profile_photo_url), ''),
      gcash_qr_url = nullif(trim(vendor_gcash_qr_url), ''),
      maya_qr_url = nullif(trim(vendor_maya_qr_url), ''),
      payment_account_name = nullif(trim(vendor_payment_account_name), '')
  where id = auth.uid();

  if not found then
    raise exception 'Vendor profile not found';
  end if;
end;
$$;

revoke all on function public.update_vendor_profile(text, text, text, text, text, text, text, text, text) from public;
grant execute on function public.update_vendor_profile(text, text, text, text, text, text, text, text, text) to authenticated;

insert into storage.buckets (id, name, public)
values ('vendor-verification', 'vendor-verification', false)
on conflict (id) do nothing;

drop policy if exists "Vendors can upload their verification files" on storage.objects;
drop policy if exists "Authenticated users can upload vendor verification files" on storage.objects;
drop policy if exists "Admins can view verification files" on storage.objects;
drop policy if exists "Admins can delete verification files" on storage.objects;

create policy "Vendors can upload their verification files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'vendor-verification'
  and name like (auth.uid()::text || '/%')
);

drop policy if exists "Vendors can delete their payment QR files" on storage.objects;
create policy "Vendors can delete their payment QR files"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'vendor-verification'
  and name like (auth.uid()::text || '/%')
);

create policy "Admins can view verification files"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'vendor-verification'
  and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
);

drop policy if exists "Customers can view vendor profile photos" on storage.objects;

create policy "Customers can view vendor profile photos"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'vendor-verification'
  and (
    name like (auth.uid()::text || '/%')
    or exists (
      select 1
      from public.vendors
      where vendors.id::text = split_part(storage.objects.name, '/', 1)
        and vendors.is_verified = true
    )
  )
);

create policy "Admins can delete verification files"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'vendor-verification'
  and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
);
