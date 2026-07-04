-- ===========================================================================
-- Migration 0016 — Accurate counts, report visibility, and "done" rules
-- ===========================================================================
-- Run this ONCE in the Supabase SQL Editor, AFTER migration 0015. In-place
-- refinements; safe on the live database.
--
-- Fixes from the Influencer trial:
--
--   1. COUNTS were cumulative. EOD/report counts were derived from the
--      append-only activity log, so moving a task todo→in_progress→done→
--      in_progress→done counted "started"/"completed" every time. Now the
--      counts come from the CURRENT state of the tasks table, so each task
--      counts once: move a task back out of Done and "completed" drops by one
--      while "in progress" rises by one. (completed_at is cleared automatically
--      when a task leaves Done — see the existing tasks_touch trigger.)
--
--   2. REPORT VISIBILITY was department-wide for everyone. Now: employees see
--      only their OWN EOD / activity / task history; team leads see their
--      department(s); admins + HR see everyone.
--
--   3. DONE tasks are stable: the assignee can't be changed once a task is
--      Done, and no further activity is recorded. Moving a task back OUT of Done
--      removes its completion from history (un-completes it).
-- ===========================================================================

-- 1. COUNTS from current task state -----------------------------------------
-- One person's counts for a day. created = tasks they created that day;
-- in_progress = tasks assigned to them currently in progress, started that day;
-- completed = tasks assigned to them currently done, completed that day;
-- pending = tasks assigned to them not yet done. Idempotent by construction.
create or replace function public.eod_summary(emp uuid, d date)
returns jsonb language plpgsql security definer set search_path = public stable as $$
declare allowed boolean;
begin
  allowed := emp = auth.uid()
    or public.can_manage_users()
    or (public.is_team_lead() and exists (
      select 1 from public.profile_departments a
      join public.profile_departments b on a.department_id = b.department_id
      where a.profile_id = auth.uid() and b.profile_id = emp
    ));
  if not allowed then
    return null;
  end if;

  return jsonb_build_object(
    'created', (
      select count(*) from public.tasks t
      where t.created_by = emp
        and (t.created_at at time zone 'Asia/Kolkata')::date = d
    ),
    'in_progress', (
      select count(*) from public.tasks t
      where t.assigned_to = emp and t.status = 'in_progress'
        and t.started_at is not null
        and (t.started_at at time zone 'Asia/Kolkata')::date = d
    ),
    'completed', (
      select count(*) from public.tasks t
      where t.assigned_to = emp and t.status = 'done'
        and t.completed_at is not null
        and (t.completed_at at time zone 'Asia/Kolkata')::date = d
    ),
    'pending', (
      select count(*) from public.tasks t
      where t.assigned_to = emp and t.status <> 'done' and not t.archived
    )
  );
end;
$$;

-- Same counts for every employee the caller may see. Visibility is now
-- role-scoped: self / team-lead's department(s) / managers see all.
create or replace function public.eod_overview(d date)
returns table (
  employee_id uuid,
  created bigint,
  in_progress bigint,
  completed bigint,
  pending bigint
) language sql security definer set search_path = public stable as $$
  with visible as (
    select p.id from public.profiles p
    where p.deactivated_at is null and (
      public.can_manage_users()
      or p.id = auth.uid()
      or (public.is_team_lead() and exists (
        select 1 from public.profile_departments a
        join public.profile_departments b on a.department_id = b.department_id
        where a.profile_id = auth.uid() and b.profile_id = p.id
      ))
    )
  )
  select v.id,
    (select count(*) from public.tasks t
      where t.created_by = v.id
        and (t.created_at at time zone 'Asia/Kolkata')::date = d),
    (select count(*) from public.tasks t
      where t.assigned_to = v.id and t.status = 'in_progress'
        and t.started_at is not null
        and (t.started_at at time zone 'Asia/Kolkata')::date = d),
    (select count(*) from public.tasks t
      where t.assigned_to = v.id and t.status = 'done'
        and t.completed_at is not null
        and (t.completed_at at time zone 'Asia/Kolkata')::date = d),
    (select count(*) from public.tasks t
      where t.assigned_to = v.id and t.status <> 'done' and not t.archived)
  from visible v;
$$;

-- 2. REPORT VISIBILITY: employee = own, team lead = dept, manager = all -------
drop policy if exists eod_select on public.eod_reports;
create policy eod_select on public.eod_reports
  for select using (
    employee_id = auth.uid()
    or public.can_manage_users()
    or (public.is_team_lead() and exists (
      select 1 from public.profile_departments a
      join public.profile_departments b on a.department_id = b.department_id
      where a.profile_id = auth.uid() and b.profile_id = public.eod_reports.employee_id
    ))
  );

drop policy if exists activity_logs_select on public.activity_logs;
create policy activity_logs_select on public.activity_logs
  for select using (
    employee_id = auth.uid()
    or public.can_manage_users()
    or (public.is_team_lead() and exists (
      select 1 from public.profile_departments a
      join public.profile_departments b on a.department_id = b.department_id
      where a.profile_id = auth.uid() and b.profile_id = public.activity_logs.employee_id
    ))
  );

-- Task history: your own actions, your own tasks' history, your department's
-- (team lead), or everything (manager). No blanket department read for employees.
drop policy if exists task_activity_select on public.task_activity;
create policy task_activity_select on public.task_activity
  for select using (
    public.can_manage_users()
    or actor_id = auth.uid()
    or (public.is_team_lead() and department_id in (select public.my_department_ids()))
    or (task_id is not null and exists (
      select 1 from public.tasks t
      where t.id = public.task_activity.task_id
        and (t.created_by = auth.uid() or t.assigned_to = auth.uid())
    ))
  );

-- 3. DONE rules --------------------------------------------------------------
-- 3a. Lock the assignee once Done; keep the can_assign_to check otherwise.
create or replace function public.tasks_enforce_rules()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor  uuid    := auth.uid();
  is_mgr boolean := public.can_manage_users();
begin
  if actor is null then
    return new; -- trusted server/migration path
  end if;

  -- Status move: assignee, manager, or the department's team lead.
  if new.status is distinct from old.status then
    if not is_mgr
       and old.assigned_to is not null
       and old.assigned_to is distinct from actor
       and not (
         public.is_team_lead()
         and new.department_id in (select public.my_department_ids())
       )
    then
      raise exception 'Only the assignee can move this task'
        using errcode = '42501';
    end if;
  end if;

  -- Assignee change: never once Done; otherwise must satisfy can_assign_to().
  if new.assigned_to is distinct from old.assigned_to then
    if old.status = 'done' then
      raise exception 'A completed task cannot be reassigned'
        using errcode = '42501';
    end if;
    if not public.can_assign_to(new.assigned_to) then
      raise exception 'You can only assign tasks to people in your department'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

-- 3b. Stop recording activity once Done, and remove the completion from history
-- when a task is moved back OUT of Done (un-complete it).
create or replace function public.tasks_log_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor uuid := coalesce(auth.uid(), new.created_by);
begin
  if new.status is distinct from old.status then
    if old.status = 'done' then
      -- Moved back out of Done: delete the completion, record nothing new.
      delete from public.task_activity
      where task_id = new.id and action = 'status_changed' and to_status = 'done';
    else
      insert into public.task_activity
        (task_id, actor_id, action, from_status, to_status, task_title, department_id)
      values (new.id, actor, 'status_changed', old.status, new.status, new.title, new.department_id);
    end if;
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

-- ===========================================================================
-- Done. Counts now reflect current task state (one per task); reports are
-- role-scoped; and completed tasks are stable in both assignee and history.
-- ===========================================================================
