-- Run in the Supabase SQL Editor after orders.sql and vendor-verification.sql.
-- Adds secure customer/vendor direct messaging for inquiries, custom bookings, and bulk orders.

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  subject text,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (customer_id, vendor_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

drop policy if exists "Participants can view conversations" on public.conversations;
create policy "Participants can view conversations" on public.conversations
for select to authenticated using (auth.uid() = customer_id or auth.uid() = vendor_id);

drop policy if exists "Customers can create conversations" on public.conversations;
create policy "Customers can create conversations" on public.conversations
for insert to authenticated with check (
  auth.uid() = customer_id
  and exists (select 1 from public.vendors where public.vendors.id = vendor_id and public.vendors.is_verified = true)
);

drop policy if exists "Participants can update conversations" on public.conversations;
create policy "Participants can update conversations" on public.conversations
for update to authenticated using (auth.uid() = customer_id or auth.uid() = vendor_id)
with check (auth.uid() = customer_id or auth.uid() = vendor_id);

drop policy if exists "Participants can view messages" on public.messages;
create policy "Participants can view messages" on public.messages
for select to authenticated using (
  exists (
    select 1 from public.conversations
    where public.conversations.id = conversation_id
      and (public.conversations.customer_id = auth.uid() or public.conversations.vendor_id = auth.uid())
  )
);

drop policy if exists "Participants can send messages" on public.messages;
create policy "Participants can send messages" on public.messages
for insert to authenticated with check (
  auth.uid() = sender_id
  and exists (
    select 1 from public.conversations
    where public.conversations.id = conversation_id
      and (public.conversations.customer_id = auth.uid() or public.conversations.vendor_id = auth.uid())
  )
);

drop policy if exists "Participants can mark messages read" on public.messages;
create policy "Participants can mark messages read" on public.messages
for update to authenticated using (
  exists (
    select 1 from public.conversations
    where public.conversations.id = conversation_id
      and (public.conversations.customer_id = auth.uid() or public.conversations.vendor_id = auth.uid())
  )
) with check (
  exists (
    select 1 from public.conversations
    where public.conversations.id = conversation_id
      and (public.conversations.customer_id = auth.uid() or public.conversations.vendor_id = auth.uid())
  )
);

drop function if exists public.get_or_create_conversation(uuid, uuid, text, uuid);
create or replace function public.get_or_create_conversation(
  conversation_vendor_id uuid,
  conversation_customer_id uuid,
  conversation_subject text default null,
  conversation_order_id uuid default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare conversation_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if auth.uid() <> conversation_customer_id and auth.uid() <> conversation_vendor_id then
    raise exception 'You are not a participant in this conversation';
  end if;
  if not exists (select 1 from public.vendors where id = conversation_vendor_id and is_verified = true) then
    raise exception 'This vendor is not available for messaging';
  end if;

  insert into public.conversations (customer_id, vendor_id, order_id, subject)
  values (conversation_customer_id, conversation_vendor_id, conversation_order_id, nullif(trim(conversation_subject), ''))
  on conflict (customer_id, vendor_id) do update
    set order_id = coalesce(public.conversations.order_id, excluded.order_id),
        subject = coalesce(public.conversations.subject, excluded.subject)
  returning id into conversation_id;

  return conversation_id;
end;
$$;

grant execute on function public.get_or_create_conversation(uuid, uuid, text, uuid) to authenticated;

create or replace function public.touch_conversation()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists messages_touch_conversation on public.messages;
create trigger messages_touch_conversation
after insert on public.messages
for each row execute function public.touch_conversation();

create index if not exists conversations_customer_idx on public.conversations(customer_id, last_message_at desc);
create index if not exists conversations_vendor_idx on public.conversations(vendor_id, last_message_at desc);
create index if not exists messages_conversation_idx on public.messages(conversation_id, created_at);
