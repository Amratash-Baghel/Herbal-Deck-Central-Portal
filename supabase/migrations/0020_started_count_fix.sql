-- ===========================================================================
-- Migration 0020 — "Started" count no longer reverts to zero
-- ===========================================================================
-- Run this ONCE in the Supabase SQL Editor, AFTER migration 0019.
--
-- Bug: eod_summary()/eod_overview() counted "started" (in_progress) only for
-- tasks CURRENTLY in_progress with started_at = d. So a task started today and
-- then moved to Done (or back to To Do) the same day dropped out of "started"
-- entirely — even though the work genuinely began that day.
--
-- Fix: "started" now counts by started_at's date alone, regardless of the
-- task's CURRENT status. started_at is stamped once (see tasks_touch, 0010)
-- and never reset, so moving a task back and forth still counts it only once —
-- it just no longer disappears when the task moves on to Done or back to To Do.
-- "Completed" keeps its existing, deliberately revocable behaviour (moving a
-- task out of Done un-completes it — see 0016); "pending" keeps following
-- current status. Only "started" changes.
-- ===========================================================================

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
      where t.assigned_to = emp
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
      where t.assigned_to = v.id
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

-- ===========================================================================
-- Done. "Started" now sticks once a task has entered In Progress that day, no
-- matter how many times it's since moved on.
-- ===========================================================================
