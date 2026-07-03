-- ===========================================================================
-- Migration 0013 — Profile avatars + the team_lead role (enum value)
-- ===========================================================================
-- Run this ONCE in the Supabase SQL Editor, AFTER migration 0012.
--
-- Two additive changes:
--   1. Profile pictures — a public `avatars` storage bucket (own-folder writes,
--      public read) and an `avatar_path` column on profiles.
--   2. The `team_lead` role — added to the user_role enum here so that the
--      helpers/policies that use it (migration 0014) can be created next. Enum
--      values must be committed before they're used, which is why this is split
--      from 0014.
--
-- NOTE: run this file on its own, then run 0014.
-- ===========================================================================

-- 1. team_lead role value ---------------------------------------------------
alter type public.user_role add value if not exists 'team_lead';

-- 2. Avatar column ----------------------------------------------------------
alter table public.profiles add column if not exists avatar_path text;

-- 3. Avatars storage bucket (public read) -----------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Row Level Security on the objects: anyone may read (public bucket), and a
-- signed-in user may write/replace/delete ONLY files under their own folder
-- (path starts with their uid, e.g. "<uid>/1699999999.png").
drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatars_own_insert" on storage.objects;
create policy "avatars_own_insert" on storage.objects
  for insert with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_own_update" on storage.objects;
create policy "avatars_own_update" on storage.objects
  for update using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_own_delete" on storage.objects;
create policy "avatars_own_delete" on storage.objects
  for delete using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ===========================================================================
-- Done. Now run 0014_team_lead_and_eod.sql.
-- ===========================================================================
