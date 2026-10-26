-- Apply before deploying API 1.4. Preserves every profile ID and ride reference.
begin;
alter table public.profiles
  alter column auth0_sub drop not null,
  add column if not exists supabase_user_id uuid references auth.users(id);
create unique index if not exists profiles_supabase_user_id_key on public.profiles(supabase_user_id);

create or replace function public.current_user_role()
returns public.user_role language sql stable security definer set search_path = ''
as $$ select role from public.profiles where supabase_user_id = (select auth.uid()) $$;
create or replace function public.current_user_profile_id()
returns uuid language sql stable security definer set search_path = ''
as $$ select id from public.profiles where supabase_user_id = (select auth.uid()) $$;
drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile" on public.profiles for select to authenticated
  using (supabase_user_id = (select auth.uid()));

-- Explicit operator mapping only. Do not auto-link by email or display name.
-- Invoke before the migrated user first opens the API to avoid a second profile.
create or replace function public.link_vai_identity(profile_id uuid, auth_user_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare existing uuid;
begin
  if not exists(select 1 from auth.users where id = auth_user_id) then
    raise exception 'Auth user does not exist';
  end if;
  select supabase_user_id into existing from public.profiles where id = profile_id for update;
  if not found then raise exception 'VAI profile does not exist'; end if;
  if existing is not null and existing <> auth_user_id then
    raise exception 'Profile is already linked';
  end if;
  if exists(select 1 from public.profiles where supabase_user_id = auth_user_id and id <> profile_id) then
    raise exception 'Auth identity already has another profile; manual reconciliation required';
  end if;
  update public.profiles set supabase_user_id = auth_user_id where id = profile_id;
end;
$$;
revoke all on function public.link_vai_identity(uuid, uuid) from public, anon, authenticated;
grant execute on function public.link_vai_identity(uuid, uuid) to service_role;
commit;
