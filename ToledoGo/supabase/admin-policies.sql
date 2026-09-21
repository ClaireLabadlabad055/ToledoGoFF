-- Run this in the Supabase SQL Editor.
-- First remove any older testing policies that grant access to anon.
-- The admin user's app_metadata.role must be set to 'admin' with the
-- Supabase dashboard or a trusted server using the service role key.

create policy "Admins can view vendors"
on public.vendors
for select
to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "Admins can approve vendors"
on public.vendors
for update
to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "Admins can reject vendors"
on public.vendors
for delete
to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "Admins can view customers"
on public.customers
for select
to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "Admins can approve customers"
on public.customers
for update
to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "Admins can reject customers"
on public.customers
for delete
to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Keep registration working for signed-in users while preventing users from
-- inserting records for another account.
create policy "Users can create their vendor record"
on public.vendors
for insert
to authenticated
with check (auth.uid() = id);

create policy "Users can create their customer record"
on public.customers
for insert
to authenticated
with check (auth.uid() = id);

create policy "Users can view their vendor record"
on public.vendors
for select
to authenticated
using (auth.uid() = id);

create policy "Users can view their customer record"
on public.customers
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "Authenticated users can view verified vendors" on public.vendors;

create policy "Authenticated users can view verified vendors"
on public.vendors
for select
to authenticated
using (is_verified = true and is_open = true);
