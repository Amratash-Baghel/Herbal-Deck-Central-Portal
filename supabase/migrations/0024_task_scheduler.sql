-- ===========================================================================
-- Migration 0024 — Task scheduler (recurring / scheduled tasks)
-- ===========================================================================
-- Run this ONCE in the Supabase SQL Editor, AFTER migration 0023.
--
-- A schedule is a template that materialises real `tasks` onto the assignee's
-- To Do board on the days it fires:
--   recurrence: daily (Mon–Sat) | weekly (chosen weekdays) | once (a date) |
--               range (every working day between start and end)
--   target:     a person | a department | everyone
--
-- Who may schedule for whom (can_schedule_task):
--   employee   → only themselves
--   team lead  → a person in their department(s), or one of their department(s)
--   admin / HR → any person, any department, or everyone
--
-- Materialisation is idempotent: a unique (schedule_id, assigned_to,
-- schedule_date) index means re-running for a day never duplicates a task. It's
-- driven both on-demand (when someone opens their board) and by a daily cron.
-- ===========================================================================

-- 1. The schedule table ------------------------------------------------------
create table if not exists public.task_schedules (
  id                uuid primary key default gen_random_uuid(),
  title             text not null,
  description       text,
  department_id     uuid not null references public.departments(id) on delete restrict,
  created_by        uuid not null references public.profiles(id)    on delete cascade,
  target_type       text not null check (target_type in ('person','department','everyone')),
  target_person     uuid references public.profiles(id)    on delete cascade,
  target_department uuid references public.departments(id) on delete cascade,
  recurrence        text not null check (recurrence in ('daily','weekly','once','range')),
  weekdays          int[] not null default '{}',   -- 0=Sun … 6=Sat (for 'weekly')
  start_date        date not null,
  end_date          date,                          -- for 'range'; null = open-ended
  active            boolean not null default true,
  created_at        timestamptz not null default now()
);

create index if not exists task_schedules_creator_idx on public.task_schedules(created_by);
create index if not exists task_schedules_dept_idx on public.task_schedules(department_id);

alter table public.task_schedules enable row level security;

-- 2. Who may schedule for whom ----------------------------------------------
create or replace function public.can_schedule_task(ttype text, tperson uuid, tdept uuid)
returns boolean language plpgsql security definer set search_path = public stable as $$
begin
  if public.can_manage_users() then
    return ttype in ('person','department','everyone');
  end if;

  if public.is_team_lead() then
    if ttype = 'person' then
      return exists (
        select 1 from public.profile_departments a
        join public.profile_departments b on a.department_id = b.department_id
        where a.profile_id = auth.uid() and b.profile_id = tperson
      );
    elsif ttype = 'department' then
      return tdept in (select public.my_department_ids());
    end if;
    return false;
  end if;

  -- A regular employee may only schedule for themselves.
  return ttype = 'person' and tperson = auth.uid();
end;
$$;

-- 3. RLS ---------------------------------------------------------------------
drop policy if exists task_schedules_select on public.task_schedules;
create policy task_schedules_select on public.task_schedules
  for select using (
    created_by = auth.uid()
    or public.can_manage_users()
    or (public.is_team_lead() and department_id in (select public.my_department_ids()))
  );

drop policy if exists task_schedules_insert on public.task_schedules;
create policy task_schedules_insert on public.task_schedules
  for insert with check (
    created_by = auth.uid()
    and (public.can_manage_users() or department_id in (select public.my_department_ids()))
    and public.can_schedule_task(target_type, target_person, target_department)
  );

drop policy if exists task_schedules_update on public.task_schedules;
create policy task_schedules_update on public.task_schedules
  for update using (created_by = auth.uid() or public.can_manage_users())
  with check (created_by = auth.uid() or public.can_manage_users());

drop policy if exists task_schedules_delete on public.task_schedules;
create policy task_schedules_delete on public.task_schedules
  for delete using (created_by = auth.uid() or public.can_manage_users());

-- 4. Link materialised tasks back to their schedule + occurrence date --------
alter table public.tasks add column if not exists schedule_id uuid
  references public.task_schedules(id) on delete set null;
alter table public.tasks add column if not exists schedule_date date;

-- Idempotency: one task per (schedule, assignee, day).
create unique index if not exists tasks_schedule_unique
  on public.tasks(schedule_id, assigned_to, schedule_date)
  where schedule_id is not null;

-- 5. Materialisation ---------------------------------------------------------
-- Creates the tasks due on date `d` for the active schedules (optionally scoped
-- to a single employee `emp`). SECURITY DEFINER so it can insert on behalf of
-- the schedule's creator and bypass the tasks INSERT policy — the permission
-- check already happened when the schedule was created.
create or replace function public.materialize_scheduled_tasks(d date, emp uuid default null)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with due as (
    select s.* from public.task_schedules s
    where s.active
      and s.start_date <= d
      and (s.end_date is null or d <= s.end_date)
      and case s.recurrence
            when 'once'   then d = s.start_date
            when 'daily'  then extract(dow from d) <> 0            -- skip Sunday
            when 'range'  then extract(dow from d) <> 0            -- working days
            when 'weekly' then extract(dow from d)::int = any(s.weekdays)
            else false
          end
  ),
  ins as (
    insert into public.tasks
      (title, description, status, created_by, assigned_to, department_id, schedule_id, schedule_date)
    select s.title, s.description, 'todo', s.created_by, p.id, s.department_id, s.id, d
    from due s
    join public.profiles p
      on p.deactivated_at is null
     and (
       (s.target_type = 'person'     and p.id = s.target_person)
       or (s.target_type = 'everyone')
       or (s.target_type = 'department' and exists (
             select 1 from public.profile_departments pd
             where pd.profile_id = p.id and pd.department_id = s.target_department
           ))
     )
    where (emp is null or p.id = emp)
    -- The WHERE predicate lets Postgres infer the PARTIAL unique index as the
    -- conflict arbiter (required for partial indexes).
    on conflict (schedule_id, assigned_to, schedule_date)
      where schedule_id is not null do nothing
    returning 1
  )
  select count(*) into n from ins;
  return coalesce(n, 0);
end;
$$;

-- Convenience wrapper: materialise today's (IST) tasks for the CURRENT user, so
-- their board shows scheduled work the moment they open it — independent of the
-- cron.
create or replace function public.materialize_my_scheduled_tasks()
returns integer language sql security definer set search_path = public as $$
  select public.materialize_scheduled_tasks(
    (now() at time zone 'Asia/Kolkata')::date, auth.uid()
  );
$$;

-- ===========================================================================
-- Done. Create schedules from the app (Tasks → Scheduler); tasks appear on the
-- assignee's board on the matching days (on board-load + a daily cron).
-- ===========================================================================
