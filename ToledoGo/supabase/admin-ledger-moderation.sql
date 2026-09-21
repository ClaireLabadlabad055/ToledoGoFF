-- Run after orders.sql and loyalty-reviews.sql.
-- Adds weekly vendor payouts and admin review/dispute moderation.

create table if not exists public.vendor_payouts (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  gross_amount numeric(10, 2) not null default 0,
  refund_offsets numeric(10, 2) not null default 0,
  net_amount numeric(10, 2) not null default 0,
  status text not null default 'pending' check (status in ('pending', 'disbursed')),
  disbursed_at timestamptz,
  disbursed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (vendor_id, period_start, period_end)
);

alter table public.vendor_payouts enable row level security;
drop policy if exists "Admins can manage vendor payouts" on public.vendor_payouts;
create policy "Admins can manage vendor payouts"
on public.vendor_payouts
for all to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

alter table public.reviews
  add column if not exists moderation_status text not null default 'published',
  add column if not exists admin_notes text,
  add column if not exists moderated_at timestamptz,
  add column if not exists moderated_by uuid references auth.users(id),
  add column if not exists vendor_response text,
  add column if not exists vendor_responded_at timestamptz;

alter table public.reviews drop constraint if exists reviews_moderation_status_check;
alter table public.reviews add constraint reviews_moderation_status_check
  check (moderation_status in ('published', 'hidden'));

drop policy if exists "Admins can moderate reviews" on public.reviews;
create policy "Admins can moderate reviews"
on public.reviews
for all to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "Vendors can view their reviews" on public.reviews;
create policy "Vendors can view their reviews" on public.reviews
for select to authenticated using (auth.uid() = vendor_id);

drop policy if exists "Vendors can update their review responses" on public.reviews;
create policy "Vendors can update their review responses" on public.reviews
for update to authenticated using (auth.uid() = vendor_id)
with check (auth.uid() = vendor_id);

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

alter table public.vendors
  add column if not exists quality_status text not null default 'normal',
  add column if not exists warning_count integer not null default 0,
  add column if not exists suspended_until timestamptz,
  add column if not exists banned_at timestamptz,
  add column if not exists last_quality_action_at timestamptz;

alter table public.vendors
  drop constraint if exists vendors_quality_status_check;

alter table public.vendors
  add constraint vendors_quality_status_check
  check (quality_status in ('normal', 'warning', 'suspended', 'banned'));

create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references auth.users(id) on delete set null,
  customer_id uuid references auth.users(id) on delete set null,
  vendor_id uuid references public.vendors(id) on delete cascade,
  review_id uuid references public.reviews(id) on delete cascade,
  order_id uuid references public.orders(id) on delete cascade,
  category text not null default 'vendor_issue',
  reason text not null,
  details text,
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high', 'critical')),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  action_taken text not null default 'pending' check (action_taken in ('pending', 'warning', 'suspended', 'banned', 'dismissed')),
  admin_notes text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id),
  constraint content_reports_target_check check (review_id is not null or order_id is not null or vendor_id is not null)
);

alter table public.content_reports enable row level security;
drop policy if exists "Users can create content reports" on public.content_reports;
create policy "Users can create content reports"
on public.content_reports
for insert to authenticated
with check (auth.uid() = reporter_id);

drop policy if exists "Admins can manage content reports" on public.content_reports;
create policy "Admins can manage content reports"
on public.content_reports
for all to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create or replace function public.submit_vendor_report(
  report_vendor_id uuid,
  report_reason text,
  report_details text,
  report_category text default 'vendor_issue',
  report_severity text default 'medium'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  created_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be logged in to file a report';
  end if;

  if report_vendor_id is null then
    raise exception 'Vendor is required';
  end if;

  insert into public.content_reports (
    reporter_id,
    customer_id,
    vendor_id,
    category,
    reason,
    details,
    severity,
    status,
    action_taken
  )
  values (
    auth.uid(),
    auth.uid(),
    report_vendor_id,
    coalesce(nullif(trim(report_category), ''), 'vendor_issue'),
    coalesce(nullif(trim(report_reason), ''), 'Vendor issue'),
    nullif(trim(report_details), ''),
    coalesce(nullif(trim(report_severity), ''), 'medium'),
    'open',
    'pending'
  )
  returning id into created_id;

  return created_id;
end;
$$;

grant execute on function public.submit_vendor_report(uuid, text, text, text, text) to authenticated;

create or replace function public.apply_vendor_quality_action(report_id uuid, action text, admin_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  report_record public.content_reports%rowtype;
  vendor_quality_status text;
  warning_total integer;
begin
  if (auth.jwt() -> 'app_metadata' ->> 'role') <> 'admin' then
    raise exception 'Only admins can apply vendor quality actions';
  end if;

  select * into report_record
  from public.content_reports
  where id = report_id
  for update;

  if not found then
    raise exception 'Report does not exist';
  end if;

  if report_record.vendor_id is null then
    raise exception 'This report is not tied to a vendor';
  end if;

  if action not in ('warning', 'suspended', 'banned', 'dismissed') then
    raise exception 'Invalid quality action';
  end if;

  update public.content_reports
  set status = 'resolved',
      action_taken = action,
      admin_notes = coalesce(nullif(trim(admin_note), ''), report_record.admin_notes),
      resolved_at = now(),
      resolved_by = auth.uid()
  where id = report_id;

  if action = 'dismissed' then
    update public.vendors
    set last_quality_action_at = now()
    where id = report_record.vendor_id;
    return;
  end if;

  if action = 'warning' then
    update public.vendors
    set quality_status = 'warning',
        warning_count = coalesce(warning_count, 0) + 1,
        last_quality_action_at = now(),
        suspended_until = null
    where id = report_record.vendor_id;
    return;
  end if;

  if action = 'suspended' then
    update public.vendors
    set quality_status = 'suspended',
        suspended_until = now() + interval '7 days',
        last_quality_action_at = now(),
        is_open = false,
        verification_status = 'under_review'
    where id = report_record.vendor_id;
    return;
  end if;

  if action = 'banned' then
    update public.vendors
    set quality_status = 'banned',
        banned_at = now(),
        last_quality_action_at = now(),
        is_verified = false,
        is_open = false,
        verification_status = 'rejected',
        suspended_until = null
    where id = report_record.vendor_id;
  end if;
end;
$$;

grant execute on function public.apply_vendor_quality_action(uuid, text, text) to authenticated;

create or replace function public.disburse_vendor_payout(payout_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if (auth.jwt() -> 'app_metadata' ->> 'role') <> 'admin' then
    raise exception 'Only admins can disburse vendor payouts';
  end if;

  update public.vendor_payouts
  set status = 'disbursed', disbursed_at = now(), disbursed_by = auth.uid()
  where id = payout_id and status = 'pending';

  if not found then
    raise exception 'Payout is already disbursed or does not exist';
  end if;
end;
$$;

revoke all on function public.disburse_vendor_payout(uuid) from public;
grant execute on function public.disburse_vendor_payout(uuid) to authenticated;

create index if not exists vendor_payouts_period_idx
  on public.vendor_payouts(period_start, period_end, status);
create index if not exists content_reports_status_idx
  on public.content_reports(status, created_at desc);
create index if not exists content_reports_vendor_idx
  on public.content_reports(vendor_id, status, created_at desc);
create index if not exists reviews_moderation_status_idx
  on public.reviews(moderation_status, created_at desc);
