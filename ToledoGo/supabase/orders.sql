-- Run in Supabase SQL Editor to enable vendor order management.

create extension if not exists pgcrypto;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  qr_code_string text not null default encode(gen_random_bytes(18), 'hex'),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  customer_id uuid references auth.users(id) on delete set null,
  customer_name text not null default 'Customer',
  customer_phone text,
  items jsonb not null default '[]'::jsonb,
  total numeric(10, 2) not null default 0,
  status text not null default 'pending',
  fulfillment_mode text not null default 'instore',
  pickup_details text,
  payment_method text not null default 'Cash on pickup',
  payment_reference text,
  payment_status text not null default 'not_required',
  payment_amount numeric(10, 2) not null default 0,
  payment_verification_expires_at timestamptz,
  payment_verified_at timestamptz,
  refund_amount numeric(10, 2) not null default 0,
  refund_status text not null default 'not_applicable',
  cancellation_reason text,
  delivery_address text,
  delivery_notes text,
  special_instructions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_status_check check (status in ('pending', 'preparing', 'ready', 'completed', 'cancelled')),
  constraint orders_fulfillment_check check (fulfillment_mode in ('instore', 'meetup'))
);

alter table public.orders
  add column if not exists payment_reference text,
  add column if not exists payment_status text not null default 'not_required',
  add column if not exists payment_amount numeric(10, 2) not null default 0,
  add column if not exists payment_verification_expires_at timestamptz,
  add column if not exists payment_verified_at timestamptz,
  add column if not exists refund_amount numeric(10, 2) not null default 0,
  add column if not exists refund_status text not null default 'not_applicable',
  add column if not exists cancellation_reason text;

alter table public.orders
  drop constraint if exists orders_refund_status_check,
  add constraint orders_refund_status_check check (refund_status in ('not_applicable', 'wallet_credited', 'pending_external', 'settlement_pending', 'settled'));

create table if not exists public.vendor_settlement_adjustments (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  order_id uuid not null unique references public.orders(id) on delete cascade,
  amount numeric(10, 2) not null check (amount > 0),
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'settled', 'voided')),
  created_at timestamptz not null default now(),
  settled_at timestamptz
);

alter table public.vendor_settlement_adjustments enable row level security;
drop policy if exists "Vendors can view settlement adjustments" on public.vendor_settlement_adjustments;
create policy "Vendors can view settlement adjustments" on public.vendor_settlement_adjustments
for select to authenticated using (auth.uid() = vendor_id);
drop policy if exists "Admins can manage settlement adjustments" on public.vendor_settlement_adjustments;
create policy "Admins can manage settlement adjustments" on public.vendor_settlement_adjustments
for all to authenticated using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

alter table public.orders
  drop constraint if exists orders_payment_status_check,
  add constraint orders_payment_status_check check (payment_status in ('not_required', 'awaiting_verification', 'verified', 'rejected'));

update public.orders
set payment_amount = greatest(total, 0),
    payment_verification_expires_at = coalesce(payment_verification_expires_at, created_at + interval '30 minutes')
where payment_method in ('GCash', 'Maya')
  and payment_reference is not null;

create unique index if not exists orders_online_payment_reference_idx
  on public.orders(lower(trim(payment_reference)))
  where payment_method in ('GCash', 'Maya') and payment_reference is not null;

create or replace function public.prepare_online_payment_order()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.payment_method in ('GCash', 'Maya') then
    new.payment_reference := upper(nullif(trim(new.payment_reference), ''));
    if new.payment_reference is null then
      raise exception 'A GCash or Maya reference number is required';
    end if;
    if char_length(new.payment_reference) < 6 or char_length(new.payment_reference) > 100 then
      raise exception 'The payment reference number does not look valid';
    end if;
    new.payment_amount := greatest(coalesce(new.total, 0), 0);
    if new.payment_status = 'not_required' then new.payment_status := 'awaiting_verification'; end if;
    if new.payment_status = 'awaiting_verification' and new.payment_verification_expires_at is null then
      new.payment_verification_expires_at := now() + interval '30 minutes';
    end if;
    if new.payment_status = 'verified' and new.payment_verification_expires_at < now() then
      raise exception 'This payment verification window has expired';
    end if;
    if new.payment_status = 'verified' and new.payment_verified_at is null then
      new.payment_verified_at := now();
    end if;
  else
    new.payment_amount := 0;
    new.payment_verification_expires_at := null;
    new.payment_verified_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists prepare_online_payment_order on public.orders;
create trigger prepare_online_payment_order
before insert or update of payment_method, payment_reference, payment_status, total on public.orders
for each row execute function public.prepare_online_payment_order();

alter table public.orders
  add column if not exists qr_code_string text;

update public.orders
set qr_code_string = encode(gen_random_bytes(18), 'hex')
where qr_code_string is null;

alter table public.orders
  alter column qr_code_string set default encode(gen_random_bytes(18), 'hex'),
  alter column qr_code_string set not null;

create unique index if not exists orders_qr_code_string_idx
  on public.orders(qr_code_string);

alter table public.orders enable row level security;

drop policy if exists "Admins can view all orders" on public.orders;
create policy "Admins can view all orders"
on public.orders
for select
to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "Vendors can view their orders" on public.orders;
drop policy if exists "Vendors can update their orders" on public.orders;
drop policy if exists "Customers can view their orders" on public.orders;
drop policy if exists "Customers can create orders" on public.orders;
drop policy if exists "Customers can cancel pending orders" on public.orders;

create policy "Vendors can view their orders"
on public.orders
for select
to authenticated
using (auth.uid() = vendor_id);

create policy "Vendors can update their orders"
on public.orders
for update
to authenticated
using (auth.uid() = vendor_id)
with check (auth.uid() = vendor_id);

create policy "Customers can view their orders"
on public.orders
for select
to authenticated
using (auth.uid() = customer_id);

create policy "Customers can create orders"
on public.orders
for insert
to authenticated
with check (
  auth.uid() = customer_id
  and exists (
    select 1 from public.vendors
    where public.vendors.id = orders.vendor_id
      and public.vendors.is_verified = true
      and public.vendors.is_open = true
  )
);

create policy "Customers can cancel pending orders"
on public.orders
for update
to authenticated
using (auth.uid() = customer_id and status = 'pending')
with check (auth.uid() = customer_id and status = 'cancelled');

-- Enforce the cancellation policy. Cash orders are refunded to the internal
-- wallet; direct QRPH orders create a vendor deduction for an external refund.
create or replace function public.handle_order_cancellation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  order_item jsonb;
  item_id uuid;
  item_quantity integer;
  refund numeric(10, 2);
  is_vendor boolean;
begin
  if old.status in ('completed', 'cancelled') then
    raise exception 'This order can no longer be cancelled';
  end if;

  is_vendor := auth.uid() = old.vendor_id;
  if old.status <> 'pending' and not is_vendor then
    raise exception 'Cancellation is unavailable after preparation begins';
  end if;
  if not is_vendor and auth.uid() <> old.customer_id then
    raise exception 'You cannot cancel this order';
  end if;

  refund := greatest(coalesce(old.total, 0) + coalesce(old.coin_discount, 0), 0);
  new.refund_amount := refund;
  new.refund_status := case
    when old.payment_method in ('GCash', 'Maya') and old.payment_reference is not null then 'settlement_pending'
    else 'wallet_credited'
  end;
  if new.cancellation_reason is null then
    new.cancellation_reason := case when is_vendor then 'Vendor emergency or out of stock' else 'Customer cancelled before preparation' end;
  end if;

  if old.payment_method in ('GCash', 'Maya') and old.payment_reference is not null then
    insert into public.vendor_settlement_adjustments (vendor_id, order_id, amount, reason)
    values (old.vendor_id, old.id, refund, 'Online payment refund: ' || new.cancellation_reason)
    on conflict (order_id) do nothing;
  else
    insert into public.customer_wallets (customer_id, coin_balance)
    values (old.customer_id, refund)
    on conflict (customer_id) do update
      set coin_balance = public.customer_wallets.coin_balance + refund,
          updated_at = now();
    insert into public.coin_transactions (customer_id, amount, reason, order_id)
    values (old.customer_id, refund, 'Order refund: ' || new.cancellation_reason, old.id);
  end if;

  for order_item in select value from jsonb_array_elements(old.items)
  loop
    item_id := (order_item ->> 'id')::uuid;
    item_quantity := (order_item ->> 'qty')::integer;
    update public.menus
    set stock_quantity = stock_quantity + greatest(coalesce(item_quantity, 0), 0),
        is_available = true
    where id = item_id and vendor_id = old.vendor_id;
  end loop;
  return new;
end;
$$;

drop trigger if exists handle_order_cancellation on public.orders;
create trigger handle_order_cancellation
before update of status on public.orders
for each row when (new.status = 'cancelled' and old.status <> 'cancelled')
execute function public.handle_order_cancellation();

revoke all on function public.handle_order_cancellation() from public;

create or replace function public.complete_vendor_refund(adjustment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  adjustment public.vendor_settlement_adjustments%rowtype;
begin
  if (auth.jwt() -> 'app_metadata' ->> 'role') <> 'admin' then
    raise exception 'Only admins can complete vendor refunds';
  end if;

  update public.vendor_settlement_adjustments
  set status = 'settled', settled_at = now()
  where id = adjustment_id and status = 'pending'
  returning * into adjustment;

  if not found then
    raise exception 'Settlement is already completed or does not exist';
  end if;

  update public.orders
  set refund_status = 'settled', updated_at = now()
  where id = adjustment.order_id and refund_status = 'settlement_pending';
end;
$$;

revoke all on function public.complete_vendor_refund(uuid) from public;
grant execute on function public.complete_vendor_refund(uuid) to authenticated;

-- Decrease inventory atomically when an order is created. If any line cannot
-- be fulfilled, the order insert is rejected and no stock is changed.
create or replace function public.decrement_menu_stock_for_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  order_item jsonb;
  item_id uuid;
  requested_quantity integer;
begin
  for order_item in select value from jsonb_array_elements(new.items)
  loop
    item_id := (order_item ->> 'id')::uuid;
    requested_quantity := (order_item ->> 'qty')::integer;

    if requested_quantity is null or requested_quantity < 1 then
      raise exception 'Invalid quantity for menu item %', item_id;
    end if;

    update public.menus
    set stock_quantity = stock_quantity - requested_quantity,
        is_available = stock_quantity - requested_quantity > 0
    where id = item_id
      and vendor_id = new.vendor_id
      and is_available = true
      and stock_quantity >= requested_quantity;

    if not found then
      raise exception 'Insufficient stock for menu item %', item_id
        using errcode = 'P0001';
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists decrement_menu_stock_on_order on public.orders;
create trigger decrement_menu_stock_on_order
before insert on public.orders
for each row
execute function public.decrement_menu_stock_for_order();

revoke all on function public.decrement_menu_stock_for_order() from public;

create index if not exists orders_vendor_status_idx on public.orders(vendor_id, status);
create index if not exists orders_created_at_idx on public.orders(created_at desc);
create index if not exists vendor_settlement_adjustments_vendor_idx on public.vendor_settlement_adjustments(vendor_id, status);
