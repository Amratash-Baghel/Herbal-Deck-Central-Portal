-- ===========================================================================
-- Migration 0009 — Activity logs (passive attendance)
-- ===========================================================================
-- Run this ONCE in the Supabase SQL Editor, AFTER migration 0008. Additive.
--
-- A passive "attendance" record: every time an employee uses the portal, the
-- app stamps their activity — no clock-in button, nothing they have to do. One
-- row per employee per day (IST):
--   first_seen_at  → when they first showed up ("arrived")
--   last_seen_at   → the most recent activity
--   pages_visited  → the distinct routes they opened that day
--   actions_count  → how many page loads / actions
--   eod_submitted_at → when they submitted their EOD ("left"), if they did
--
-- Writes go through `record_activity()` (SECURITY DEFINER, keyed to auth.uid()
-- so nobody can forge someone else's attendance) and a trigger on eod_reports.
-- ===========================================================================

create table if not exists public.activity_logs (
  id               uuid primary key default gen_random_uuid(),
  employee_id      uuid not null references public.profiles(id) on delete cascade,
  date             date not null,
  first_seen_at    timestamptz not null default now(),
  last_seen_at     timestamptz not null default now(),
  pages_visited    text[] not null default '{}',
  actions_count    integer not null default 0,
  eod_submitted_at timestamptz,
  created_at       timestamptz not null default now(),
  unique (employee_id, date)
);

create index if not exists activity_logs_employee_date_idx
  on public.activity_logs(employee_id, date desc);
create index if not exists activity_logs_date_idx
  on public.activity_logs(date);

alter table public.activity_logs enable row level security;

-- Read: your own; shared-department colleagues; managers see all. Mirrors the
-- eod_reports visibility rules exactly.
drop policy if exists activity_logs_select on public.activity_logs;
create policy activity_logs_select on public.activity_logs
  for select using (
    employee_id = auth.uid()
    or public.can_manage_users()
    or exists (
      select 1 from public.profile_departments a
      join public.profile_departments b on a.department_id = b.department_id
      where a.profile_id = auth.uid() and b.profile_id = public.activity_logs.employee_id
    )
  );
-- No INSERT/UPDATE policy on purpose: rows are only written by the SECURITY
-- DEFINER function + trigger below, so a client can never fabricate attendance.

-- Record one unit of activity for the CURRENT user, today (IST). Upserts the
-- day's row: sets first_seen_at on first touch, always advances last_seen_at,
-- counts the action, and adds the route to the distinct pages list.
create or replace function public.record_activity(page text)
returns void language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if auth.uid() is null then
    return;
  end if;

  insert into public.activity_logs
    (employee_id, date, first_seen_at, last_seen_at, pages_visited, actions_count)
  values (
    auth.uid(), d, now(), now(),
    case when coalesce(page, '') = '' then '{}'::text[] else array[page] end,
    1
  )
  on conflict (employee_id, date) do update set
    last_seen_at = now(),
    actions_count = activity_logs.actions_count + 1,
    pages_visited = case
      when coalesce(page, '') = '' then activity_logs.pages_visited
      when page = any(activity_logs.pages_visited) then activity_logs.pages_visited
      else array_append(activity_logs.pages_visited, page)
    end;
end;
$$;

-- When an EOD report is saved, stamp that day's activity row as "clocked out".
create or replace function public.eod_mark_activity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.activity_logs
    (employee_id, date, first_seen_at, last_seen_at, eod_submitted_at, actions_count)
  values (new.employee_id, new.report_date, now(), now(), now(), 0)
  on conflict (employee_id, date) do update set
    eod_submitted_at = now(),
    last_seen_at = greatest(activity_logs.last_seen_at, now());
  return new;
end;
$$;

drop trigger if exists eod_reports_activity on public.eod_reports;
create trigger eod_reports_activity
  after insert or update on public.eod_reports
  for each row execute function public.eod_mark_activity();

-- ===========================================================================
-- Done. Nothing to configure — the app calls record_activity() as people
-- browse, and the trigger handles the EOD "clock-out".
-- ===========================================================================
