-- Run in the Supabase SQL Editor.
-- Stores customer profile preferences and saved kitchens securely per account.

alter table public.customers
  add column if not exists default_delivery_address text;

alter table public.customers
  add column if not exists profile_photo_url text;

insert into storage.buckets (id, name, public)
values ('customer-avatars', 'customer-avatars', false)
on conflict (id) do nothing;

drop policy if exists "Customers can upload their avatar" on storage.objects;
create policy "Customers can upload their avatar"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'customer-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Customers can view their avatar" on storage.objects;
create policy "Customers can view their avatar"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'customer-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Customers can update their avatar" on storage.objects;
create policy "Customers can update their avatar"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'customer-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'customer-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Customers can delete their avatar" on storage.objects;
create policy "Customers can delete their avatar"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'customer-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create table if not exists public.customer_preferences (
  customer_id uuid primary key references auth.users(id) on delete cascade,
  order_updates boolean not null default true,
  local_picks boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_favorite_kitchens (
  customer_id uuid not null references auth.users(id) on delete cascade,
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (customer_id, vendor_id)
);

alter table public.customer_preferences enable row level security;
alter table public.customer_favorite_kitchens enable row level security;

drop policy if exists "Customers can view their preferences" on public.customer_preferences;
create policy "Customers can view their preferences"
on public.customer_preferences
for select
to authenticated
using (auth.uid() = customer_id);

drop policy if exists "Customers can create their preferences" on public.customer_preferences;
create policy "Customers can create their preferences"
on public.customer_preferences
for insert
to authenticated
with check (auth.uid() = customer_id);

drop policy if exists "Customers can update their preferences" on public.customer_preferences;
create policy "Customers can update their preferences"
on public.customer_preferences
for update
to authenticated
using (auth.uid() = customer_id)
with check (auth.uid() = customer_id);

drop policy if exists "Customers can view their saved kitchens" on public.customer_favorite_kitchens;
create policy "Customers can view their saved kitchens"
on public.customer_favorite_kitchens
for select
to authenticated
using (auth.uid() = customer_id);

drop policy if exists "Customers can save verified kitchens" on public.customer_favorite_kitchens;
create policy "Customers can save verified kitchens"
on public.customer_favorite_kitchens
for insert
to authenticated
with check (
  auth.uid() = customer_id
  and exists (
    select 1
    from public.vendors
    where public.vendors.id = vendor_id
      and public.vendors.is_verified = true
      and public.vendors.is_open = true
  )
);

drop policy if exists "Customers can remove their saved kitchens" on public.customer_favorite_kitchens;
create policy "Customers can remove their saved kitchens"
on public.customer_favorite_kitchens
for delete
to authenticated
using (auth.uid() = customer_id);

create index if not exists customer_favorite_kitchens_vendor_idx
  on public.customer_favorite_kitchens(vendor_id);

-- Keep updated_at current when preferences change.
create or replace function public.set_customer_preferences_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists customer_preferences_updated_at
on public.customer_preferences;

create trigger customer_preferences_updated_at
before update on public.customer_preferences
for each row execute function public.set_customer_preferences_updated_at();

-- Customers can maintain only their own delivery address.
drop policy if exists "Customers can update their customer profile" on public.customers;
create policy "Customers can update their customer profile"
on public.customers
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);
