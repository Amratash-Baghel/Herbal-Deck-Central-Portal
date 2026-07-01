-- ===========================================================================
-- Migration 0010 — Task history & lifecycle timestamps
-- ===========================================================================
-- Run this ONCE in the Supabase SQL Editor, AFTER migration 0009. Additive /
-- in-place refinements; safe on the live database.
--
-- What changes and why:
--   1. tasks.started_at — stamped the first time a task enters "In Progress",
--      so we can show when work began and compute "time in progress".
--   2. task_activity now SURVIVES task deletion. Previously the log cascaded
--      away with the task; but a task that was completed and later deleted was
--      still real work, and must remain in that day's EOD/history. We make
--      task_id nullable (ON DELETE SET NULL) and denormalise task_title +
--      department_id onto each row so the record is self-contained.
--   3. The status-change log is exposed as `task_activity_log` (a view with the
--      column names the app's history UI expects: changed_by / changed_at).
--   4. archive_stale_done_tasks() — moves "Done" tasks older than 7 days off
--      the board (archived = true) while keeping them in history. Called daily
--      by the cron.
--
-- NOTE: `public.task_activity` (created in 0006) IS the task activity log. We
-- extend it here rather than add a parallel table, so the single source of
-- truth that already powers EOD keeps powering it.
-- ===========================================================================

-- 1. Lifecycle timestamp -----------------------------------------------------
alter table public.tasks add column if not exists started_at timestamptz;

-- 2. Make the activity log durable + self-contained --------------------------
alter table public.task_activity add column if not exists task_title   text;
alter table public.task_activity add column if not exists department_id uuid;

-- Re-point the FK so deleting a task nulls the reference instead of deleting
-- the history.
alter table public.task_activity drop constraint if exists task_activity_task_id_fkey;
alter table public.task_activity alter column task_id drop not null;
alter table public.task_activity
  add constraint task_activity_task_id_fkey
  foreign key (task_id) references public.tasks(id) on delete set null;

-- Backfill the denormalised columns for existing rows.
update public.task_activity ta
set task_title = t.title, department_id = t.department_id
from public.tasks t
where ta.task_id = t.id and ta.task_title is null;

-- 3. Triggers ---------------------------------------------------------------
-- 3a. Maintain updated_at, completed_at, AND started_at.
create or replace function public.tasks_touch()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if new.status = 'done' and (old.status is distinct from 'done') then
    new.completed_at := now();
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;
  if new.status = 'in_progress'
     and (old.status is distinct from 'in_progress')
     and new.started_at is null then
    new.started_at := now();
  end if;
  return new;
end;
$$;

-- 3b. Log creation, denormalising the title + department.
create or replace function public.tasks_log_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.task_activity
    (task_id, actor_id, action, to_status, task_title, department_id)
  values (new.id, new.created_by, 'created', new.status, new.title, new.department_id);
  return new;
end;
$$;

-- 3c. Log status changes, (re)assignment, and archiving.
create or replace function public.tasks_log_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor uuid := coalesce(auth.uid(), new.created_by);
begin
  if new.status is distinct from old.status then
    insert into public.task_activity
      (task_id, actor_id, action, from_status, to_status, task_title, department_id)
    values (new.id, actor, 'status_changed', old.status, new.status, new.title, new.department_id);
  end if;
  if new.assigned_to is distinct from old.assigned_to then
    insert into public.task_activity
      (task_id, actor_id, action, task_title, department_id)
    values (new.id, actor, 'assigned', new.title, new.department_id);
  end if;
  if new.archived and not old.archived then
    insert into public.task_activity
      (task_id, actor_id, action, task_title, department_id)
    values (new.id, actor, 'archived', new.title, new.department_id);
  end if;
  return new;
end;
$$;

-- 4. Read policy: managers see everything (incl. orphaned rows from deleted
-- tasks); you see your own actions; department members see department activity;
-- and anyone who can still see the underlying task sees its rows.
drop policy if exists task_activity_select on public.task_activity;
create policy task_activity_select on public.task_activity
  for select using (
    public.can_manage_users()
    or actor_id = auth.uid()
    or department_id in (select public.my_department_ids())
    or (task_id is not null and public.can_view_task(task_id))
  );

-- 5. Spec-named view over the log (changed_by / changed_at column names).
--    security_invoker = true so the querier's RLS on task_activity applies.
drop view if exists public.task_activity_log;
create view public.task_activity_log
  with (security_invoker = true) as
  select
    id,
    task_id,
    actor_id    as changed_by,
    from_status,
    to_status,
    action,
    task_title,
    department_id,
    created_at  as changed_at
  from public.task_activity;

-- 6. Auto-archive stale completed tasks (called by the daily cron).
create or replace function public.archive_stale_done_tasks()
returns integer language sql security definer set search_path = public as $$
  with updated as (
    update public.tasks
    set archived = true
    where status = 'done'
      and not archived
      and completed_at is not null
      and completed_at < now() - interval '7 days'
    returning 1
  )
  select coalesce(count(*), 0)::int from updated;
$$;

-- ===========================================================================
-- Done. Task history is now durable and timestamped; stale done tasks archive
-- off the board automatically (via the cron) but stay in history.
-- ===========================================================================
