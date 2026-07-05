-- ===========================================================================
-- Migration 0018 — HR-role permission, task colours, employee colours
-- ===========================================================================
-- Run this ONCE in the Supabase SQL Editor, AFTER migration 0017.
--
--   1. is_hr_management() now returns true for the ROLE hr_management as well as
--      HR & Management department membership — so can_manage_users() /
--      can_manage_billing() automatically honour both, keeping every existing
--      department-based check working unchanged.
--   2. tasks.color — the creator's chosen sticky-note colour (shown to everyone).
--   3. profiles.color — a default accent colour per employee, assigned so no two
--      people in the same department share one (backfilled below; new employees
--      are assigned one by the invite action).
-- ===========================================================================

-- 1. HR & Management = role OR department --------------------------------------
create or replace function public.is_hr_management()
returns boolean language sql security definer set search_path = public stable as $$
  select
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'hr_management'
    )
    or exists (
      select 1
      from public.profile_departments pd
      join public.departments d on d.id = pd.department_id
      where pd.profile_id = auth.uid() and d.slug = 'hr-management'
    );
$$;

-- 2. Task colour --------------------------------------------------------------
alter table public.tasks add column if not exists color text;

-- 3. Employee default colour + backfill --------------------------------------
alter table public.profiles add column if not exists color text;

with palette as (
  select array[
    '#ef4444','#f97316','#f59e0b','#eab308',
    '#84cc16','#22c55e','#10b981','#14b8a6',
    '#06b6d4','#3b82f6','#6366f1','#8b5cf6',
    '#a855f7','#ec4899'
  ]::text[] as colors
),
ranked as (
  select p.id,
    row_number() over (
      partition by pd.department_id
      order by p.created_at, p.id
    ) as rn
  from public.profiles p
  left join lateral (
    select department_id
    from public.profile_departments
    where profile_id = p.id
    order by department_id
    limit 1
  ) pd on true
)
update public.profiles p
set color = (select colors from palette)[(((r.rn - 1) % 14) + 1)]
from ranked r
where r.id = p.id and p.color is null;

-- ===========================================================================
-- Done. HR & Management can now be assigned as a role; tasks carry a colour;
-- and each employee has a department-unique accent colour.
-- ===========================================================================
