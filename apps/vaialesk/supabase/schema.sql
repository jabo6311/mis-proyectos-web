create extension if not exists pgcrypto;

create type public.user_role as enum ('passenger', 'driver', 'admin');
create type public.driver_review_status as enum ('pending', 'approved', 'rejected');
create type public.ride_status as enum (
  'searching',
  'accepted',
  'in_progress',
  'completed',
  'cancelled'
);

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth0_sub text not null unique,
  full_name text not null default '',
  role public.user_role not null default 'passenger',
  driver_status public.driver_review_status not null default 'pending',
  created_at timestamptz not null default now()
);

create table public.rides (
  id uuid primary key default gen_random_uuid(),
  passenger_id uuid not null references public.profiles(id),
  driver_id uuid references public.profiles(id),
  pickup_address text not null,
  destination_address text not null,
  pickup_lat double precision not null,
  pickup_lng double precision not null,
  destination_lat double precision not null,
  destination_lng double precision not null,
  payment_method text not null default 'cash' check (payment_method = 'cash'),
  status public.ride_status not null default 'searching',
  estimated_fare integer not null default 0 check (estimated_fare >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ratings (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null unique references public.rides(id),
  passenger_id uuid not null references public.profiles(id),
  driver_id uuid not null references public.profiles(id),
  score integer not null check (score between 1 and 5),
  comment text not null default '' check (char_length(comment) <= 1000),
  created_at timestamptz not null default now()
);

create table public.support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  ride_id uuid references public.rides(id),
  message text not null check (char_length(message) between 1 and 2000),
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger rides_updated_at
  before update on public.rides
  for each row execute procedure public.set_updated_at();

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

alter table public.profiles enable row level security;
alter table public.rides enable row level security;
alter table public.ratings enable row level security;
alter table public.support_requests enable row level security;

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

alter publication supabase_realtime add table public.rides;
