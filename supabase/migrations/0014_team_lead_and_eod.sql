-- ===========================================================================
-- Migration 0014 — Team-lead helper, EOD-submitted notifications, incomplete
-- ===========================================================================
-- Run this ONCE in the Supabase SQL Editor, AFTER migration 0013 (the
-- team_lead enum value must already be committed).
--
--   1. is_team_lead() — role check helper.
--   2. EOD-submitted notifications, as a TRIGGER. Previously the app raised
--      these through the service-role client from a Server Action; if the
--      service-role key wasn't available at runtime the insert silently failed
--      and no one was notified. A database trigger is independent of any env
--      var and fires whenever an EOD row is first inserted — so admins + HR are
--      reliably notified.
--   3. activity_logs.incomplete — set by the end-of-day cron when someone was
--      active but never submitted their EOD, so attendance can be flagged.
-- ===========================================================================

-- 1. Team-lead helper -------------------------------------------------------
create or replace function public.is_team_lead()
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'team_lead'
  );
$$;

-- 2. Notify admins + HR when an EOD report is submitted ---------------------
create or replace function public.notify_eod_submitted()
returns trigger language plpgsql security definer set search_path = public as $$
declare who text;
begin
  select coalesce(full_name, email) into who
  from public.profiles where id = new.employee_id;

  insert into public.notifications (recipient_id, type, title, body, link, data)
  select
    p.id,
    'eod_submitted',
    'EOD submitted',
    coalesce(who, 'Someone') || ' submitted their end-of-day report',
    '/reporting/employees/' || new.employee_id::text,
    jsonb_build_object('employeeId', new.employee_id, 'date', new.report_date)
  from public.profiles p
  where p.deactivated_at is null
    and p.id <> new.employee_id
    and (
      p.role = 'admin'
      or exists (
        select 1
        from public.profile_departments pd
        join public.departments d on d.id = pd.department_id
        where pd.profile_id = p.id and d.slug = 'hr-management'
      )
    );

  return new;
end;
$$;

drop trigger if exists eod_reports_notify on public.eod_reports;
create trigger eod_reports_notify
  after insert on public.eod_reports
  for each row execute function public.notify_eod_submitted();

-- 3. Incomplete-attendance flag ---------------------------------------------
alter table public.activity_logs
  add column if not exists incomplete boolean not null default false;

-- Mark today's active-but-no-EOD employees as incomplete. Called by the daily
-- end-of-day cron (with the service-role client). SECURITY DEFINER so the cron
-- path is simple and the update is atomic.
create or replace function public.finalize_incomplete_attendance(d date)
returns integer language sql security definer set search_path = public as $$
  with updated as (
    update public.activity_logs
    set incomplete = true
    where date = d and eod_submitted_at is null and not incomplete
    returning 1
  )
  select coalesce(count(*), 0)::int from updated;
$$;

-- ===========================================================================
-- Done. EOD submissions now notify admins + HR via the trigger; the cron marks
-- incomplete attendance at end of day.
-- ===========================================================================
