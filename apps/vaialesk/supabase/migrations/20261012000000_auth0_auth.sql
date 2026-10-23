alter table public.profiles
  drop constraint if exists profiles_id_fkey;

alter table public.profiles
  add column if not exists auth0_sub text;

update public.profiles
set auth0_sub = 'legacy-supabase|' || id::text
where auth0_sub is null;

alter table public.profiles
  alter column id set default gen_random_uuid(),
  alter column auth0_sub set not null;

create unique index if not exists profiles_auth0_sub_key
  on public.profiles (auth0_sub);

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select role
  from public.profiles
  where auth0_sub = (select auth.jwt() ->> 'sub')
$$;

create or replace function public.current_user_profile_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id
  from public.profiles
  where auth0_sub = (select auth.jwt() ->> 'sub')
$$;

drop policy if exists "Users can read own profile" on public.profiles;
drop policy if exists "Approved drivers are visible to admins" on public.profiles;
drop policy if exists "Users can read their rides" on public.rides;
drop policy if exists "Approved drivers can read available rides" on public.rides;
drop policy if exists "Ride participants and admins can read ratings" on public.ratings;
drop policy if exists "Users can read their support requests" on public.support_requests;

create policy "Users can read own profile"
  on public.profiles for select to authenticated
  using (auth0_sub = (select auth.jwt() ->> 'sub'));

create policy "Approved drivers are visible to admins"
  on public.profiles for select to authenticated
  using (public.current_user_role() = 'admin');

create policy "Users can read their rides"
  on public.rides for select to authenticated
  using (
    passenger_id = public.current_user_profile_id()
    or driver_id = public.current_user_profile_id()
    or public.current_user_role() = 'admin'
  );

create policy "Approved drivers can read available rides"
  on public.rides for select to authenticated
  using (
    status = 'searching'
    and public.current_user_role() = 'driver'
    and exists (
      select 1 from public.profiles
      where id = public.current_user_profile_id() and driver_status = 'approved'
    )
  );

create policy "Ride participants and admins can read ratings"
  on public.ratings for select to authenticated
  using (
    passenger_id = public.current_user_profile_id()
    or driver_id = public.current_user_profile_id()
    or public.current_user_role() = 'admin'
  );

create policy "Users can read their support requests"
  on public.support_requests for select to authenticated
  using (
    user_id = public.current_user_profile_id()
    or public.current_user_role() = 'admin'
  );
