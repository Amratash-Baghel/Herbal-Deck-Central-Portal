-- ===========================================================================
-- Migration 0006 — Tasks & Reporting (Phase 5)
-- ===========================================================================
-- Run this ONCE in the Supabase SQL Editor, AFTER migrations 0002–0005. It is
-- additive and safe to run on the live database.
--
-- A personal kanban (To Do / In Progress / Done) that doubles as the source of
-- truth for end-of-day (EOD) reporting:
--   1. tasks          — the sticky-note cards (status, assignee, department,
--                       optional deadline, archive flag)
--   2. task_activity  — an append-only log of what happened to each task (who
--                       created it, who moved it, when) — this powers the EOD
--   3. eod_reports    — one row per employee per day: a snapshot of their task
--                       activity plus an optional manual note
--   4. triggers       — keep updated_at/completed_at correct and write the
--                       activity log automatically on every change
--   5. helpers        — can_view_task(), eod_summary(), eod_overview()
--   6. Row Level Security for all of the above
--
-- Day boundaries use Asia/Kolkata (IST) so "today" matches the Herbal Deck
-- working day rather than UTC.
-- ===========================================================================

-- 1. Task status -----------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'task_status') then
    create type public.task_status as enum ('todo', 'in_progress', 'done');
  end if;
end $$;

-- 2. Tasks ------------------------------------------------------------------
create table if not exists public.tasks (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text,
  status        public.task_status not null default 'todo',
  created_by    uuid not null references public.profiles(id)    on delete restrict,
  assigned_to   uuid references public.profiles(id)             on delete set null,
  department_id uuid not null references public.departments(id) on delete restrict,
  deadline      date,
  archived      boolean not null default false,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists tasks_assigned_idx   on public.tasks(assigned_to);
create index if not exists tasks_created_by_idx  on public.tasks(created_by);
create index if not exists tasks_department_idx  on public.tasks(department_id);
create index if not exists tasks_status_idx      on public.tasks(status);

-- 3. Activity log (append-only) --------------------------------------------
create table if not exists public.task_activity (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks(id) on delete cascade,
  actor_id    uuid references public.profiles(id) on delete set null,
  action      text not null,                 -- 'created' | 'status_changed' | 'assigned' | 'archived'
  from_status public.task_status,
  to_status   public.task_status,
  created_at  timestamptz not null default now()
);

create index if not exists task_activity_task_idx  on public.task_activity(task_id);
create index if not exists task_activity_actor_idx on public.task_activity(actor_id, created_at);

-- 4. EOD reports ------------------------------------------------------------
create table if not exists public.eod_reports (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.profiles(id) on delete cascade,
  report_date  date not null,
  auto_summary jsonb not null default '{}'::jsonb,
  manual_note  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (employee_id, report_date)
);

create index if not exists eod_reports_employee_idx on public.eod_reports(employee_id, report_date desc);

-- 5. Triggers ---------------------------------------------------------------
-- 5a. Keep updated_at / completed_at coherent on every update.
create or replace function public.tasks_touch()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if new.status = 'done' and (old.status is distinct from 'done') then
    new.completed_at := now();
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_before_update on public.tasks;
create trigger tasks_before_update
  before update on public.tasks
  for each row execute function public.tasks_touch();

-- 5b. Log creation. actor = the creator.
create or replace function public.tasks_log_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.task_activity (task_id, actor_id, action, to_status)
  values (new.id, new.created_by, 'created', new.status);
  return new;
end;
$$;

drop trigger if exists tasks_after_insert on public.tasks;
create trigger tasks_after_insert
  after insert on public.tasks
  for each row execute function public.tasks_log_insert();

-- 5c. Log status changes, (re)assignment, and archiving. actor = current user.
create or replace function public.tasks_log_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor uuid := coalesce(auth.uid(), new.created_by);
begin
  if new.status is distinct from old.status then
    insert into public.task_activity (task_id, actor_id, action, from_status, to_status)
    values (new.id, actor, 'status_changed', old.status, new.status);
  end if;
  if new.assigned_to is distinct from old.assigned_to then
    insert into public.task_activity (task_id, actor_id, action)
    values (new.id, actor, 'assigned');
  end if;
  if new.archived and not old.archived then
    insert into public.task_activity (task_id, actor_id, action)
    values (new.id, actor, 'archived');
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_after_update on public.tasks;
create trigger tasks_after_update
  after update on public.tasks
  for each row execute function public.tasks_log_update();

-- 6. Helpers (SECURITY DEFINER) --------------------------------------------
-- Can the current user see a given task? (own / assigned / same department /
-- manager). Used by the activity-log read policy without recursing into tasks'
-- own policies.
create or replace function public.can_view_task(t uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.tasks tk
    where tk.id = t and (
      tk.created_by = auth.uid()
      or tk.assigned_to = auth.uid()
      or tk.department_id in (
        select department_id from public.profile_departments where profile_id = auth.uid()
      )
      or public.can_manage_users()
    )
  );
$$;

-- One employee's task activity for a day (IST), as counts. Returns null when the
-- caller may not see that employee's EOD (self / same department / manager).
create or replace function public.eod_summary(emp uuid, d date)
returns jsonb language plpgsql security definer set search_path = public stable as $$
declare allowed boolean;
begin
  allowed := emp = auth.uid()
    or public.can_manage_users()
    or exists (
      select 1 from public.profile_departments a
      join public.profile_departments b on a.department_id = b.department_id
      where a.profile_id = auth.uid() and b.profile_id = emp
    );
  if not allowed then
    return null;
  end if;

  return jsonb_build_object(
    'created', (
      select count(*) from public.task_activity a
      where a.actor_id = emp and a.action = 'created'
        and (a.created_at at time zone 'Asia/Kolkata')::date = d
    ),
    'in_progress', (
      select count(*) from public.task_activity a
      where a.actor_id = emp and a.action = 'status_changed' and a.to_status = 'in_progress'
        and (a.created_at at time zone 'Asia/Kolkata')::date = d
    ),
    'completed', (
      select count(*) from public.task_activity a
      where a.actor_id = emp and a.action = 'status_changed' and a.to_status = 'done'
        and (a.created_at at time zone 'Asia/Kolkata')::date = d
    ),
    'pending', (
      select count(*) from public.tasks t
      where t.assigned_to = emp and t.status <> 'done' and not t.archived
    )
  );
end;
$$;

-- Same counts, but for every employee the caller may see — one round trip for
-- the team/admin "today" overview. Zero-activity = created+in_progress+completed = 0.
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
      or exists (
        select 1 from public.profile_departments a
        join public.profile_departments b on a.department_id = b.department_id
        where a.profile_id = auth.uid() and b.profile_id = p.id
      )
    )
  )
  select v.id,
    (select count(*) from public.task_activity a
      where a.actor_id = v.id and a.action = 'created'
        and (a.created_at at time zone 'Asia/Kolkata')::date = d),
    (select count(*) from public.task_activity a
      where a.actor_id = v.id and a.action = 'status_changed' and a.to_status = 'in_progress'
        and (a.created_at at time zone 'Asia/Kolkata')::date = d),
    (select count(*) from public.task_activity a
      where a.actor_id = v.id and a.action = 'status_changed' and a.to_status = 'done'
        and (a.created_at at time zone 'Asia/Kolkata')::date = d),
    (select count(*) from public.tasks t
      where t.assigned_to = v.id and t.status <> 'done' and not t.archived)
  from visible v;
$$;

-- 7. Row Level Security -----------------------------------------------------
alter table public.tasks         enable row level security;
alter table public.task_activity enable row level security;
alter table public.eod_reports   enable row level security;

-- Tasks: see your own + assigned + your department(s); managers see all.
drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks
  for select using (
    created_by = auth.uid()
    or assigned_to = auth.uid()
    or department_id in (select public.my_department_ids())
    or public.can_manage_users()
  );

-- Create your own task in a department you belong to (managers, anywhere).
drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks
  for insert with check (
    created_by = auth.uid()
    and (
      department_id in (select public.my_department_ids())
      or public.can_manage_users()
    )
  );

-- Edit only your own or tasks assigned to you (managers, any). This is what
-- makes other people's tasks read-only in the department view.
drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks
  for update using (
    created_by = auth.uid() or assigned_to = auth.uid() or public.can_manage_users()
  ) with check (
    created_by = auth.uid() or assigned_to = auth.uid() or public.can_manage_users()
  );

-- Delete: the creator or a manager.
drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks
  for delete using (created_by = auth.uid() or public.can_manage_users());

-- Activity log: readable when you can see the task; written only by the
-- triggers above (SECURITY DEFINER), so there is no INSERT policy.
drop policy if exists task_activity_select on public.task_activity;
create policy task_activity_select on public.task_activity
  for select using (public.can_manage_users() or public.can_view_task(task_id));

-- EOD reports: your own; shared-department colleagues; managers see all.
drop policy if exists eod_select on public.eod_reports;
create policy eod_select on public.eod_reports
  for select using (
    employee_id = auth.uid()
    or public.can_manage_users()
    or exists (
      select 1 from public.profile_departments a
      join public.profile_departments b on a.department_id = b.department_id
      where a.profile_id = auth.uid() and b.profile_id = public.eod_reports.employee_id
    )
  );

-- You write only your own EOD report.
drop policy if exists eod_insert on public.eod_reports;
create policy eod_insert on public.eod_reports
  for insert with check (employee_id = auth.uid());

drop policy if exists eod_update on public.eod_reports;
create policy eod_update on public.eod_reports
  for update using (employee_id = auth.uid()) with check (employee_id = auth.uid());

-- ===========================================================================
-- Done. Tasks & Reporting is live. Personal boards, the department/admin views,
-- and EOD reporting all read from the tables and helpers above — no extra
-- configuration is required.
-- ===========================================================================
