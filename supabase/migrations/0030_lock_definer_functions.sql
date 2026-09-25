-- 0030 — Lock down SECURITY DEFINER functions.
--
-- Every SECURITY DEFINER function in `public` was executable by PUBLIC and
-- `anon`, i.e. by anyone holding the anon key — which ships in the browser
-- bundle, so anyone who can load /login. Several also lacked caller checks:
--
--   materialize_scheduled_tasks(d, emp)  created tasks for any date
--   finalize_incomplete_attendance(d)    marked any day's attendance incomplete
--   archive_stale_done_tasks()           archived done tasks on demand
--   next_invoice_number()                consumed invoice numbers, leaving gaps
--
-- The portal never calls any of these without a session, and the cron jobs use
-- the service role, so nothing the app does changes.

-- 1. Nothing SECURITY DEFINER is callable without signing in. `authenticated`
--    and `service_role` keep their explicit grants.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
  end loop;
end $$;

-- 2. Cron-only and trigger-only functions aren't for signed-in users either.
--    (A trigger function's EXECUTE privilege isn't checked when the trigger
--    fires, only when the trigger is created, so the triggers keep working.)
revoke execute on function public.archive_stale_done_tasks()             from authenticated;
revoke execute on function public.finalize_incomplete_attendance(date)   from authenticated;
revoke execute on function public.eod_mark_activity()                    from authenticated;
revoke execute on function public.handle_new_user()                      from authenticated;
revoke execute on function public.notify_eod_submitted()                 from authenticated;
revoke execute on function public.on_message_insert()                    from authenticated;
revoke execute on function public.refresh_edited_chat_preview()          from authenticated;
revoke execute on function public.tasks_enforce_rules()                  from authenticated;
revoke execute on function public.tasks_log_insert()                     from authenticated;
revoke execute on function public.tasks_log_update()                     from authenticated;

-- 3. materialize_scheduled_tasks stays callable by signed-in users — the
--    Scheduler runs it right after a schedule is saved so today's tasks appear
--    at once — but only for today. Other dates belong to the nightly cron,
--    which runs as the service role. It is idempotent, so re-running today's
--    materialisation is harmless.
create or replace function public.materialize_scheduled_tasks(d date, emp uuid default null)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare n integer;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and d <> (now() at time zone 'Asia/Kolkata')::date then
    raise exception 'Only today''s scheduled tasks can be created on demand.'
      using errcode = '42501';
  end if;

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
$function$;

revoke execute on function public.materialize_scheduled_tasks(date, uuid) from public, anon;

-- 4. Invoice numbers are assigned by a trigger instead of a column default.
--    A column default runs with the inserting user's privileges, so every
--    signed-in user needed EXECUTE on next_invoice_number() — and could call it
--    directly to burn numbers. The trigger always assigns the number, so a
--    client can neither skip nor forge one.
create or replace function public.assign_invoice_number()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  new.invoice_number := public.next_invoice_number();
  return new;
end;
$function$;

revoke execute on function public.assign_invoice_number() from public, anon, authenticated;

drop trigger if exists invoices_assign_number on public.invoices;
create trigger invoices_assign_number
  before insert on public.invoices
  for each row execute function public.assign_invoice_number();

alter table public.invoices alter column invoice_number drop default;
revoke execute on function public.next_invoice_number() from authenticated;

-- 5. No invoice has been issued yet, but testing already consumed two numbers.
--    Restart the series so the first real invoice is HD-00001. Guarded, so this
--    is a no-op once any invoice exists.
do $$
begin
  if not exists (select 1 from public.invoices) then
    perform setval('public.invoice_number_seq', 1, false);
  end if;
end $$;
