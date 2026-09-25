-- Owner-level accounts neither file an EOD nor clock in.
--
-- The dashboard and /tasks/reports already hide the EOD form from admins, and
-- the 17:30 reminder cron now skips them. This closes the last gap: the 18:00
-- finalizer, which stamps `incomplete = true` on the attendance row of anyone
-- without an EOD — which, once owners stop filing, is every owner, every day.
-- (No owner row is flagged yet, so there is nothing to backfill.)
--
-- Replaces the version in 0014_team_lead_and_eod.sql. Same signature and same
-- return value (the number of rows flagged), so the caller in
-- app/api/cron/eod-finalize/route.ts needs no change.

create or replace function public.finalize_incomplete_attendance(d date)
returns integer
language sql
security definer
set search_path = public
as $$
  with updated as (
    update public.activity_logs l
    set incomplete = true
    where l.date = d
      and l.eod_submitted_at is null
      and not l.incomplete
      and exists (
        select 1
        from public.profiles p
        where p.id = l.employee_id
          and p.role <> 'admin'
      )
    returning 1
  )
  select coalesce(count(*), 0)::int from updated;
$$;
