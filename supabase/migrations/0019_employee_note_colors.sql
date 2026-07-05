-- ===========================================================================
-- Migration 0019 — per-employee default sticky-note colour
-- ===========================================================================
-- Run this ONCE in the Supabase SQL Editor, AFTER migration 0018.
--
-- Each employee gets a default sticky-note colour (one of the NOTE_COLORS keys),
-- assigned so that no two people in the same department share one. When a task
-- of theirs has no manually-chosen colour, its note renders in the assignee's
-- default colour — so you can tell whose note is whose at a glance (this
-- replaces the coloured dot beside a person's name).
--
-- The 10 keys below MUST stay in sync with NOTE_COLOR_KEYS in lib/tasks.ts.
-- ===========================================================================

alter table public.profiles add column if not exists note_color text;

with palette as (
  select array[
    'yellow','red','orange','pink','green',
    'teal','sky','violet','indigo','slate'
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
set note_color = (select colors from palette)[(((r.rn - 1) % 10) + 1)]
from ranked r
where r.id = p.id and p.note_color is null;

-- ===========================================================================
-- Done. Every employee now has a department-unique default note colour; new
-- employees are assigned one by the invite action (employees/actions.ts).
-- ===========================================================================
