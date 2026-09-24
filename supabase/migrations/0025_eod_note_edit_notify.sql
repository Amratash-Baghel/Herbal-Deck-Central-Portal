-- ===========================================================================
-- Migration 0025 — Notify when an EOD note is edited, not just first filed
-- ===========================================================================
-- Run this ONCE in the Supabase SQL Editor, AFTER migration 0024. In-place fix;
-- safe on the live database.
--
-- The gap: saveEodNote() always UPSERTs, and the trigger was AFTER INSERT only
-- (0014, re-asserted in 0022). So the first save of the day notified admins + HR,
-- and every later save was invisible to them. Someone who filed an empty report
-- at 6pm and then added "blocked on the vendor API" at 7pm reached nobody.
--
-- The fix: fire on UPDATE too, but only when manual_note actually changed —
-- auto_summary and updated_at change on every save and must not re-notify.
-- The guard lives in the function (not a WHEN clause) because WHEN cannot
-- reference OLD on a combined INSERT OR UPDATE trigger.
-- ===========================================================================

create or replace function public.notify_eod_submitted()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  who  text;
  verb text;
begin
  -- Re-saving the same note (or just a refreshed summary) is not news.
  if tg_op = 'UPDATE' and new.manual_note is not distinct from old.manual_note then
    return new;
  end if;

  verb := case when tg_op = 'INSERT' then 'submitted' else 'updated' end;

  select coalesce(full_name, email) into who
  from public.profiles where id = new.employee_id;

  insert into public.notifications (recipient_id, type, title, body, link, data)
  select
    p.id,
    'eod_submitted',
    case when tg_op = 'INSERT' then 'EOD submitted' else 'EOD updated' end,
    coalesce(who, 'Someone') || ' ' || verb || ' their end-of-day report',
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

drop trigger if exists eod_reports_notify on public.eod_reports;
create trigger eod_reports_notify
  after insert or update on public.eod_reports
  for each row execute function public.notify_eod_submitted();

-- ===========================================================================
-- Sanity check: submit an EOD with an empty note, then edit it to add text.
-- Two rows should appear (EOD submitted, then EOD updated); saving the same
-- note a third time should add nothing.
--   select recipient_id, title, created_at from public.notifications
--   where type = 'eod_submitted' order by created_at desc limit 20;
-- ===========================================================================
