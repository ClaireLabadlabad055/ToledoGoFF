-- Run in Supabase SQL Editor to enable vendor menus.

create table if not exists public.menus (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  name text not null,
  description text,
  price numeric(10, 2) not null default 0,
  is_available boolean not null default true,
  stock_quantity integer not null default 1 check (stock_quantity >= 0),
  menu_image_url text,
  category text not null default 'Home-cooked',
  options jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.menus
  add column if not exists menu_image_url text,
  add column if not exists category text not null default 'Home-cooked',
  add column if not exists options jsonb not null default '[]'::jsonb,
  add column if not exists stock_quantity integer not null default 1;

update public.menus
set stock_quantity = 1
where stock_quantity is null or stock_quantity < 0;

alter table public.menus
  drop constraint if exists menus_stock_quantity_check,
  add constraint menus_stock_quantity_check check (stock_quantity >= 0);

insert into storage.buckets (id, name, public)
values ('menu-images', 'menu-images', true)
on conflict (id) do update set public = true;

drop policy if exists "Vendors can upload menu images" on storage.objects;
drop policy if exists "Anyone can view menu images" on storage.objects;

create policy "Vendors can upload menu images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'menu-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Anyone can view menu images"
on storage.objects
for select
to public
using (bucket_id = 'menu-images');

alter table public.vendors
  add column if not exists is_open boolean not null default true;

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

create or replace function public.update_vendor_profile(
  vendor_business_name text,
  vendor_owner_name text,
  vendor_cuisine_specialty text,
  vendor_physical_address text,
  vendor_meetup_details text
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
      meetup_details = nullif(trim(vendor_meetup_details), '')
  where id = auth.uid();

  if not found then
    raise exception 'Vendor profile not found';
  end if;
end;
$$;

revoke all on function public.update_vendor_profile(text, text, text, text, text) from public;
grant execute on function public.update_vendor_profile(text, text, text, text, text) to authenticated;

alter table public.menus enable row level security;

drop policy if exists "Authenticated users can view verified vendors" on public.vendors;
drop policy if exists "Vendors can manage their menus" on public.menus;
drop policy if exists "Customers can view available menus" on public.menus;
drop policy if exists "Customers can view vendor menus" on public.menus;
drop policy if exists "Admins can manage menus" on public.menus;

create policy "Vendors can manage their menus"
on public.menus
for all
to authenticated
using (auth.uid() = vendor_id)
with check (auth.uid() = vendor_id);

create policy "Authenticated users can view verified vendors"
on public.vendors
for select
to authenticated
using (is_verified = true and is_open = true);

create policy "Customers can view vendor menus"
on public.menus
for select
to authenticated
using (
  exists (
    select 1 from public.vendors
    where public.vendors.id = menus.vendor_id
      and public.vendors.is_verified = true
      and public.vendors.is_open = true
  )
);


create policy "Admins can manage menus"
on public.menus
for all
to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create index if not exists menus_vendor_id_idx on public.menus(vendor_id);
create index if not exists menus_available_idx on public.menus(is_available);
create index if not exists menus_stock_quantity_idx on public.menus(stock_quantity);

do $$
begin
  alter publication supabase_realtime add table public.menus;
exception
  when duplicate_object then null;
end
$$;
