-- ===========================================================================
-- Migration 0022 — Fix EOD-submitted notifications (reach role-based HR too)
-- ===========================================================================
-- Run this ONCE in the Supabase SQL Editor, AFTER migration 0021. In-place fix;
-- safe on the live database.
--
-- The bug: notify_eod_submitted() (migration 0014) notified admins and members
-- of the HR & Management *department*, but not people granted HR authority via
-- the `hr_management` *role* (added in 0017/0018). So if HR authority was given
-- by role rather than department membership, that person received nothing when
-- an employee submitted an EOD.
--
-- The fix: the recipient filter now mirrors is_hr_management() exactly — admin,
-- OR the hr_management role, OR HR & Management department membership. The
-- trigger stays AFTER INSERT (a first submission is a true INSERT; edits are
-- UPDATEs and correctly do not re-notify).
-- ===========================================================================

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
      or p.role = 'hr_management'
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

-- Re-assert the trigger (idempotent) so a fresh apply also (re)installs it.
drop trigger if exists eod_reports_notify on public.eod_reports;
create trigger eod_reports_notify
  after insert on public.eod_reports
  for each row execute function public.notify_eod_submitted();

-- ===========================================================================
-- Done. Submitting an EOD now notifies admins + everyone with HR & Management
-- authority (role or department), immediately, via the notifications realtime
-- stream. To sanity-check: submit an EOD as a regular employee, then confirm the
-- row exists —
--   select recipient_id, title, created_at from public.notifications
--   where type = 'eod_submitted' order by created_at desc limit 20;
-- ===========================================================================
