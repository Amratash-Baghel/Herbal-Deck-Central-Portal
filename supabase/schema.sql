-- ===========================================================================
-- Herbal Deck Portal — Database Schema
-- ===========================================================================
-- Run this once in the Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- It is idempotent where practical, but is intended for initial setup.
--
-- What it creates:
--   1. A `role` enum ('admin' | 'employee')
--   2. A `profiles` table (one row per auth user, holding their role)
--   3. A trigger that auto-creates a profile when a new auth user is added
--   4. A SECURITY DEFINER helper `is_admin()` used by policies (avoids RLS
--      recursion that occurs when a profiles policy queries profiles)
--   5. Row Level Security policies enforcing role-based access
-- ===========================================================================

-- 1. Role type --------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('admin', 'employee');
  end if;
end$$;

-- 2. Profiles table ---------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  full_name  text,
  role       public.user_role not null default 'employee',
  created_at timestamptz not null default now()
);

comment on table public.profiles is
  'One profile per authenticated user. Holds the portal role for access control.';

-- 3. Auto-create a profile when a new auth user is created ------------------
-- The admin invite flow creates the auth user with user_metadata containing
-- `full_name` and `role`; this trigger copies those into the profiles table.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    coalesce(
      (new.raw_user_meta_data ->> 'role')::public.user_role,
      'employee'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4. Admin check helper -----------------------------------------------------
-- SECURITY DEFINER so it reads profiles WITHOUT re-triggering RLS. This is the
-- standard way to avoid infinite recursion in role-based policies.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

-- 5. Row Level Security -----------------------------------------------------
alter table public.profiles enable row level security;

-- Read: a user can read their own profile; admins can read all profiles.
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select"
  on public.profiles
  for select
  using (id = auth.uid() or public.is_admin());

-- Update: a user can update their own profile (but NOT their role — guarded
-- by the WITH CHECK below); admins can update any profile.
drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update"
  on public.profiles
  for update
  using (id = auth.uid() or public.is_admin())
  with check (
    public.is_admin()
    or (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()))
  );

-- Insert: only admins may insert profiles directly. (Normal creation happens
-- via the trigger above, which runs as SECURITY DEFINER and bypasses this.)
drop policy if exists "profiles_insert" on public.profiles;
create policy "profiles_insert"
  on public.profiles
  for insert
  with check (public.is_admin());

-- Delete: only admins may delete profiles.
drop policy if exists "profiles_delete" on public.profiles;
create policy "profiles_delete"
  on public.profiles
  for delete
  using (public.is_admin());

-- ===========================================================================
-- Bootstrapping your FIRST admin
-- ===========================================================================
-- There is intentionally no public sign-up. To create the very first admin:
--
--   1. Dashboard → Authentication → Users → "Add user" → enter email + password
--      (tick "Auto Confirm User").
--   2. The trigger creates a matching profile with the default 'employee' role.
--   3. Promote that user to admin by running:
--
--        update public.profiles
--        set role = 'admin'
--        where email = 'you@herbaldeck.com';
--
-- After that, this admin can invite everyone else from inside the portal.
-- ===========================================================================
