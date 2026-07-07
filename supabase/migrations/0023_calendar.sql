-- ===========================================================================
-- Migration 0023 — Calendar module (events with role-scoped visibility) + DOB
-- ===========================================================================
-- Run this ONCE in the Supabase SQL Editor, AFTER migration 0022. Additive and
-- safe on the live database.
--
--   1. profiles.date_of_birth — optional; drives the birthday markers (shown to
--      everyone, year-recurring). No time zone: a birthday is a plain date.
--   2. calendar_events — a company calendar with four visibility tiers:
--        personal  → only the creator sees it
--        department→ everyone in the given department(s) (created by team leads)
--        common    → the whole company (visible_to_all; created by admins/HR)
--        targeted  → only the selected department(s) (created by admins/HR)
--   3. can_create_calendar_event() — encodes who may create which type, so the
--      INSERT policy stays readable.
--   4. RLS enforcing the visibility + creation rules at the database level.
--
-- Columns use event_date / event_time (not the reserved-ish date / time).
-- ===========================================================================

-- 1. Date of birth -----------------------------------------------------------
alter table public.profiles add column if not exists date_of_birth date;

-- 2. Calendar events ---------------------------------------------------------
create table if not exists public.calendar_events (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  description    text,
  event_type     text not null check (event_type in ('personal','department','common','targeted')),
  event_date     date not null,
  event_time     time,                 -- optional time of day
  created_by     uuid not null references public.profiles(id) on delete cascade,
  department_ids uuid[],               -- for 'department' / 'targeted'
  visible_to_all boolean not null default false,
  created_at     timestamptz not null default now()
);

create index if not exists calendar_events_date_idx on public.calendar_events(event_date);
create index if not exists calendar_events_creator_idx on public.calendar_events(created_by);

alter table public.calendar_events enable row level security;

-- 3. Who may create which event type ----------------------------------------
-- personal → anyone (for themselves); department → team leads for their own
-- department(s); common/targeted → admins + HR & Management. Admins/HR may also
-- post department events. SECURITY DEFINER so it can read memberships without
-- recursing through RLS.
create or replace function public.can_create_calendar_event(
  etype text, dept_ids uuid[], vis_all boolean
) returns boolean language plpgsql security definer set search_path = public stable as $$
declare mine uuid[];
begin
  if etype = 'personal' then
    return true; -- the policy also pins created_by = auth.uid()
  end if;

  if public.can_manage_users() then
    -- admins + HR & Management: office-wide, targeted, or department events
    if etype = 'common' then return vis_all; end if;
    if etype = 'targeted' then return coalesce(array_length(dept_ids, 1), 0) > 0; end if;
    if etype = 'department' then return coalesce(array_length(dept_ids, 1), 0) > 0; end if;
    return false;
  end if;

  if etype = 'department' and public.is_team_lead() then
    select array_agg(department_id) into mine
    from public.profile_departments where profile_id = auth.uid();
    return coalesce(array_length(dept_ids, 1), 0) > 0
       and dept_ids <@ coalesce(mine, '{}'::uuid[]);
  end if;

  return false;
end;
$$;

-- 4. Row Level Security ------------------------------------------------------
-- SELECT: office-wide events, your own, or events targeted at a department you
-- belong to.
drop policy if exists calendar_events_select on public.calendar_events;
create policy calendar_events_select on public.calendar_events
  for select using (
    visible_to_all
    or created_by = auth.uid()
    or (
      department_ids is not null and exists (
        select 1 from public.profile_departments pd
        where pd.profile_id = auth.uid()
          and pd.department_id = any(department_ids)
      )
    )
  );

drop policy if exists calendar_events_insert on public.calendar_events;
create policy calendar_events_insert on public.calendar_events
  for insert with check (
    created_by = auth.uid()
    and public.can_create_calendar_event(event_type, department_ids, visible_to_all)
  );

drop policy if exists calendar_events_update on public.calendar_events;
create policy calendar_events_update on public.calendar_events
  for update using (created_by = auth.uid())
  with check (
    created_by = auth.uid()
    and public.can_create_calendar_event(event_type, department_ids, visible_to_all)
  );

-- Creators delete their own; admins/HR may remove any event (moderation).
drop policy if exists calendar_events_delete on public.calendar_events;
create policy calendar_events_delete on public.calendar_events
  for delete using (created_by = auth.uid() or public.can_manage_users());

-- ===========================================================================
-- Done. The calendar is enforced at the database: a user only ever reads events
-- they're allowed to see, and can only create the types their role permits.
-- Birthdays are derived from profiles.date_of_birth (no rows here).
-- ===========================================================================
