-- ===========================================================================
-- Migration 0012 — Employee "post" (job title / designation)
-- ===========================================================================
-- Run this ONCE in the Supabase SQL Editor, AFTER migration 0011. Additive.
--
-- Adds a free-text `post` (designation) to profiles, captured when an employee
-- is created. The invite flow passes it in user_metadata; the auto-provision
-- trigger copies it into the profile alongside full_name and role.
-- ===========================================================================

alter table public.profiles add column if not exists post text;

-- Recreate the provisioning trigger to also copy `post` from user_metadata.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role, post)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    coalesce(
      (new.raw_user_meta_data ->> 'role')::public.user_role,
      'employee'
    ),
    new.raw_user_meta_data ->> 'post'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ===========================================================================
-- Done. New employees can be given a post on the Add-employee form.
-- ===========================================================================
