-- Run in the Supabase SQL Editor after orders.sql.
-- Adds post-purchase reviews, customer loyalty coins, and checkout redemption.

alter table public.orders
  add column if not exists coin_discount numeric(10, 2) not null default 0,
  add column if not exists coins_redeemed numeric(10, 2) not null default 0;

alter table public.orders
  alter column coins_redeemed type numeric(10, 2) using coins_redeemed::numeric;

create table if not exists public.customer_wallets (
  customer_id uuid primary key references auth.users(id) on delete cascade,
  coin_balance numeric(10, 2) not null default 0 check (coin_balance >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.coin_transactions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(10, 2) not null,
  reason text not null,
  order_id uuid references public.orders(id) on delete set null,
  review_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  customer_id uuid not null references auth.users(id) on delete cascade,
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  menu_item_id uuid not null references public.menus(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  comment text,
  photo_url text,
  coins_awarded numeric(10, 2) not null default 0 check (coins_awarded between 0 and 5),
  created_at timestamptz not null default now(),
  unique (order_id, customer_id, menu_item_id)
);

alter table public.customers
  add column if not exists last_login_coin_date date;

alter table public.customer_wallets
  alter column coin_balance type numeric(10, 2) using coin_balance::numeric;

alter table public.coin_transactions
  alter column amount type numeric(10, 2) using amount::numeric;

alter table public.reviews
  alter column coins_awarded type numeric(10, 2) using coins_awarded::numeric;

alter table public.reviews
  add column if not exists moderation_status text not null default 'published',
  add column if not exists vendor_response text,
  add column if not exists vendor_responded_at timestamptz;

alter table public.customer_wallets enable row level security;
alter table public.coin_transactions enable row level security;
alter table public.reviews enable row level security;

drop policy if exists "Customers can view their wallet" on public.customer_wallets;
create policy "Customers can view their wallet" on public.customer_wallets
for select to authenticated using (auth.uid() = customer_id);

drop policy if exists "Customers can view their coin transactions" on public.coin_transactions;
create policy "Customers can view their coin transactions" on public.coin_transactions
for select to authenticated using (auth.uid() = customer_id);

drop policy if exists "Customers can view reviews" on public.reviews;
create policy "Customers can view reviews" on public.reviews
for select to authenticated using (auth.uid() = customer_id);

drop policy if exists "Customers can view vendor reviews" on public.reviews;
create policy "Customers can view vendor reviews" on public.reviews
for select to authenticated using (
  exists (select 1 from public.vendors where public.vendors.id = reviews.vendor_id and public.vendors.is_verified = true)
);

drop policy if exists "Vendors can view their reviews" on public.reviews;
create policy "Vendors can view their reviews" on public.reviews
for select to authenticated using (auth.uid() = vendor_id);

drop policy if exists "Vendors can update their review responses" on public.reviews;
create policy "Vendors can update their review responses" on public.reviews
for update to authenticated using (auth.uid() = vendor_id)
with check (auth.uid() = vendor_id);

insert into storage.buckets (id, name, public)
values ('review-photos', 'review-photos', false)
on conflict (id) do nothing;

drop policy if exists "Customers can upload review photos" on storage.objects;
create policy "Customers can upload review photos" on storage.objects
for insert to authenticated with check (
  bucket_id = 'review-photos' and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Customers can view review photos" on storage.objects;
create policy "Customers can view review photos" on storage.objects
for select to authenticated using (
  bucket_id = 'review-photos' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (
      select 1
      from public.reviews
      join public.vendors on public.vendors.id = public.reviews.vendor_id
      where public.reviews.photo_url = storage.objects.name
        and (
          (public.reviews.moderation_status = 'published' and public.vendors.is_verified = true)
          or public.reviews.vendor_id = auth.uid()
        )
    )
  )
);

drop function if exists public.get_customer_coin_balance();

create or replace function public.get_customer_coin_balance()
returns numeric
language plpgsql security definer set search_path = public
as $$
declare balance numeric;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  insert into public.customer_wallets (customer_id) values (auth.uid()) on conflict do nothing;
  select coin_balance into balance from public.customer_wallets where customer_id = auth.uid();
  return coalesce(balance, 0);
end;
$$;

grant execute on function public.get_customer_coin_balance() to authenticated;

drop function if exists public.submit_review(uuid, uuid, integer, text, text);

create or replace function public.claim_daily_login_bonus()
returns numeric
language plpgsql security definer set search_path = public
as $$
declare awarded numeric := 0.5;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  update public.customers
  set last_login_coin_date = current_date
  where id = auth.uid()
    and (last_login_coin_date is null or last_login_coin_date < current_date);

  if found then
    insert into public.customer_wallets (customer_id, coin_balance)
    values (auth.uid(), awarded)
    on conflict (customer_id) do update
      set coin_balance = public.customer_wallets.coin_balance + awarded,
          updated_at = now();
    insert into public.coin_transactions (customer_id, amount, reason)
    values (auth.uid(), awarded, 'Daily login bonus');
    return awarded;
  end if;

  return 0;
end;
$$;

grant execute on function public.claim_daily_login_bonus() to authenticated;

create or replace function public.submit_review(
  review_order_id uuid,
  review_menu_item_id uuid,
  review_rating integer,
  review_comment text,
  review_photo_url text
)
returns table (coins_awarded numeric, new_balance numeric)
language plpgsql security definer set search_path = public
as $$
declare
  order_vendor_id uuid;
  item_exists boolean;
  reward numeric := 0;
  wallet_balance numeric;
  inserted_review_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if review_rating < 1 or review_rating > 5 then raise exception 'Rating must be between 1 and 5'; end if;

  select vendor_id into order_vendor_id from public.orders
  where id = review_order_id and customer_id = auth.uid() and status = 'completed';
  if order_vendor_id is null then raise exception 'Only completed orders can be reviewed'; end if;

  select exists (
    select 1 from jsonb_array_elements((select items from public.orders where id = review_order_id)) item
    where item ->> 'id' = review_menu_item_id::text
  ) into item_exists;
  if not item_exists then raise exception 'This item was not part of the order'; end if;

  reward := (case when nullif(trim(review_comment), '') is not null then 2 else 0 end)
          + (case when nullif(trim(review_photo_url), '') is not null then 3 else 0 end);

  insert into public.reviews (order_id, customer_id, vendor_id, menu_item_id, rating, comment, photo_url, coins_awarded)
  values (review_order_id, auth.uid(), order_vendor_id, review_menu_item_id, review_rating,
          nullif(trim(review_comment), ''), nullif(trim(review_photo_url), ''), reward)
  returning id into inserted_review_id;

  insert into public.customer_wallets (customer_id, coin_balance)
  values (auth.uid(), reward)
  on conflict (customer_id) do update
    set coin_balance = public.customer_wallets.coin_balance + excluded.coin_balance,
        updated_at = now();

  if reward > 0 then
    insert into public.coin_transactions (customer_id, amount, reason, order_id, review_id)
    values (auth.uid(), reward, 'Review reward', review_order_id, inserted_review_id);
  end if;

  select coin_balance into wallet_balance from public.customer_wallets where customer_id = auth.uid();
  return query select reward, wallet_balance;
exception when unique_violation then
  raise exception 'You already reviewed this item';
end;
$$;

grant execute on function public.submit_review(uuid, uuid, integer, text, text) to authenticated;

drop function if exists public.respond_to_review(uuid, text);

create or replace function public.respond_to_review(
  response_review_id uuid,
  response_text text
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if nullif(trim(response_text), '') is null then raise exception 'Response cannot be empty'; end if;

  update public.reviews
  set vendor_response = nullif(trim(response_text), ''),
      vendor_responded_at = now()
  where id = response_review_id and vendor_id = auth.uid();

  if not found then raise exception 'Review not found for this vendor'; end if;
end;
$$;

grant execute on function public.respond_to_review(uuid, text) to authenticated;

create or replace function public.redeem_coins_for_order()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare current_balance integer;
  max_redemption integer;
begin
  max_redemption := floor(greatest(new.total, 0) * 0.30)::integer;
  new.coins_redeemed := least(greatest(coalesce(new.coins_redeemed, 0), 0), max_redemption);
  new.coin_discount := new.coins_redeemed;
  if new.coins_redeemed = 0 then new.coin_discount := 0; return new; end if;

  update public.customer_wallets
  set coin_balance = coin_balance - new.coins_redeemed, updated_at = now()
  where customer_id = new.customer_id and coin_balance >= new.coins_redeemed;
  if not found then raise exception 'Insufficient loyalty coins'; end if;

  insert into public.coin_transactions (customer_id, amount, reason, order_id)
  values (new.customer_id, -new.coins_redeemed, 'Order discount', new.id);
  new.total := greatest(new.total - new.coin_discount, 0);
  return new;
end;
$$;

drop trigger if exists redeem_coins_before_order on public.orders;
create trigger redeem_coins_before_order before insert on public.orders
for each row execute function public.redeem_coins_for_order();

revoke all on function public.redeem_coins_for_order() from public;
create index if not exists reviews_vendor_idx on public.reviews(vendor_id);
create index if not exists reviews_order_idx on public.reviews(order_id);
