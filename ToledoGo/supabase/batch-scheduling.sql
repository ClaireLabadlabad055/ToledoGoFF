-- Run after menus.sql and orders.sql.
-- Adds dated home-kitchen batches, cutoffs, batch inventory, and order linkage.

create table if not exists public.vendor_batches (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  name text not null,
  starts_at timestamptz not null,
  cutoff_at timestamptz not null,
  pickup_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'open', 'closed', 'cancelled')),
  created_at timestamptz not null default now(),
  constraint vendor_batches_times_check check (starts_at < cutoff_at and cutoff_at <= pickup_at)
);

create table if not exists public.batch_menu_inventory (
  batch_id uuid not null references public.vendor_batches(id) on delete cascade,
  menu_id uuid not null references public.menus(id) on delete cascade,
  quantity_remaining integer not null check (quantity_remaining >= 0),
  primary key (batch_id, menu_id)
);

alter table public.orders add column if not exists batch_id uuid references public.vendor_batches(id) on delete set null;
alter table public.vendor_batches enable row level security;
alter table public.batch_menu_inventory enable row level security;

drop policy if exists "Vendors can manage their batches" on public.vendor_batches;
create policy "Vendors can manage their batches" on public.vendor_batches for all to authenticated
using (auth.uid() = vendor_id) with check (auth.uid() = vendor_id);
drop policy if exists "Customers can view open batches" on public.vendor_batches;
create policy "Customers can view open batches" on public.vendor_batches for select to authenticated using (
  status in ('scheduled', 'open') and exists (select 1 from public.vendors where id = vendor_id and is_verified = true and is_open = true)
);
drop policy if exists "Vendors can manage batch inventory" on public.batch_menu_inventory;
create policy "Vendors can manage batch inventory" on public.batch_menu_inventory for all to authenticated
using (exists (select 1 from public.vendor_batches where id = batch_id and vendor_id = auth.uid()))
with check (exists (select 1 from public.vendor_batches where id = batch_id and vendor_id = auth.uid()));
drop policy if exists "Customers can view open batch inventory" on public.batch_menu_inventory;
create policy "Customers can view open batch inventory" on public.batch_menu_inventory for select to authenticated using (
  exists (select 1 from public.vendor_batches where id = batch_id and status = 'open' and cutoff_at > now())
);

create or replace function public.sync_vendor_batch_statuses()
returns void language plpgsql security definer set search_path = public
as $$
begin
  update public.vendor_batches set status = 'open' where status = 'scheduled' and starts_at <= now() and cutoff_at > now();
  update public.vendor_batches set status = 'closed' where status = 'open' and cutoff_at <= now();
end;
$$;
grant execute on function public.sync_vendor_batch_statuses() to authenticated;

create or replace function public.get_open_vendor_batches(target_vendor_id uuid)
returns table (id uuid, name text, cutoff_at timestamptz, pickup_at timestamptz)
language plpgsql security definer set search_path = public
as $$
begin
  perform public.sync_vendor_batch_statuses();
  return query select b.id, b.name, b.cutoff_at, b.pickup_at from public.vendor_batches b
  where b.vendor_id = target_vendor_id and b.status = 'open' and b.cutoff_at > now()
    and exists (select 1 from public.vendors v where v.id = b.vendor_id and v.is_verified = true and v.is_open = true)
  order by b.pickup_at;
end;
$$;
grant execute on function public.get_open_vendor_batches(uuid) to authenticated;

create or replace function public.get_vendor_batches(target_vendor_id uuid)
returns table (id uuid, name text, starts_at timestamptz, cutoff_at timestamptz, pickup_at timestamptz, status text)
language plpgsql security definer set search_path = public
as $$
begin
  perform public.sync_vendor_batch_statuses();
  return query select b.id, b.name, b.starts_at, b.cutoff_at, b.pickup_at, b.status
  from public.vendor_batches b
  where b.vendor_id = target_vendor_id
    and b.status in ('scheduled', 'open')
    and exists (select 1 from public.vendors v where v.id = b.vendor_id and v.is_verified = true and v.is_open = true)
    and (b.status = 'open' or b.starts_at > now())
  order by b.pickup_at;
end;
$$;
grant execute on function public.get_vendor_batches(uuid) to authenticated;

create or replace function public.decrement_batch_stock_for_order()
returns trigger language plpgsql security definer set search_path = public
as $$
declare order_item jsonb; item_id uuid; requested_quantity integer; batch_vendor uuid;
begin
  if new.batch_id is null then return new; end if;
  perform public.sync_vendor_batch_statuses();
  select vendor_id into batch_vendor from public.vendor_batches where id = new.batch_id and status = 'open' and cutoff_at > now() for update;
  if batch_vendor is null or batch_vendor <> new.vendor_id then raise exception 'This batch is closed or unavailable'; end if;
  for order_item in select value from jsonb_array_elements(new.items) loop
    item_id := (order_item ->> 'id')::uuid;
    requested_quantity := (order_item ->> 'qty')::integer;
    if requested_quantity is null or requested_quantity < 1 then raise exception 'Invalid batch quantity'; end if;
    update public.batch_menu_inventory set quantity_remaining = quantity_remaining - requested_quantity
    where batch_id = new.batch_id and menu_id = item_id and quantity_remaining >= requested_quantity;
    if not found then raise exception 'Insufficient stock for this batch'; end if;
  end loop;
  return new;
end;
$$;
drop trigger if exists decrement_batch_stock_on_order on public.orders;
create trigger decrement_batch_stock_on_order before insert on public.orders for each row execute function public.decrement_batch_stock_for_order();
revoke all on function public.decrement_batch_stock_for_order() from public;

-- Batch orders use batch_menu_inventory instead of the legacy global menu stock.
create or replace function public.decrement_menu_stock_for_order()
returns trigger language plpgsql security definer set search_path = public
as $$
declare order_item jsonb; item_id uuid; requested_quantity integer;
begin
  if new.batch_id is not null then return new; end if;
  for order_item in select value from jsonb_array_elements(new.items) loop
    item_id := (order_item ->> 'id')::uuid;
    requested_quantity := (order_item ->> 'qty')::integer;
    if requested_quantity is null or requested_quantity < 1 then raise exception 'Invalid quantity for menu item %', item_id; end if;
    update public.menus set stock_quantity = stock_quantity - requested_quantity, is_available = stock_quantity - requested_quantity > 0
    where id = item_id and vendor_id = new.vendor_id and is_available = true and stock_quantity >= requested_quantity;
    if not found then raise exception 'Insufficient stock for menu item %', item_id; end if;
  end loop;
  return new;
end;
$$;
revoke all on function public.decrement_menu_stock_for_order() from public;

create index if not exists vendor_batches_vendor_pickup_idx on public.vendor_batches(vendor_id, pickup_at);
create index if not exists batch_menu_inventory_menu_idx on public.batch_menu_inventory(menu_id);
do $$ begin alter publication supabase_realtime add table public.vendor_batches; exception when duplicate_object then null; end $$;
