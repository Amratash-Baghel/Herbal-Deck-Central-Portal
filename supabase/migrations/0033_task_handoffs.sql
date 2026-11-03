-- 0033 — Cross-department hand-offs between team leads.
--
-- 1. A team lead may assign a task to the team lead of ANY department (not to
--    that department's employees). Employees still assign only to themselves;
--    admins and HR & Management still assign to anyone.
-- 2. The receiving lead may pass it down to people in their own department,
--    but not on to a third department's lead (only the task's creator can hand
--    a task across departments).
-- 3. Every lead a task passed through is recorded in tasks.handled_by, so the
--    task stays visible on their board and moves there as the assignee works.
-- 4. When the task is marked Done, its creator and every lead in handled_by
--    get a notification.

begin;

alter table public.tasks add column if not exists handled_by uuid[] not null default '{}';
create index if not exists tasks_handled_by_idx on public.tasks using gin (handled_by);

-- 1. Assignment: add "any active team lead" for team leads.
create or replace function public.can_assign_to(target uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select
    target is null
    or target = auth.uid()
    or public.can_manage_users()
    or (
      public.is_team_lead()
      and (
        exists (
          select 1
          from public.profile_departments a
          join public.profile_departments b on a.department_id = b.department_id
          where a.profile_id = auth.uid() and b.profile_id = target
        )
        or exists (
          select 1 from public.profiles p
          where p.id = target and p.role = 'team_lead' and p.deactivated_at is null
        )
      )
    );
$$;

-- 2 + 3. Update rules: block a third-department hop, record the hand-off.
create or replace function public.tasks_enforce_rules()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor  uuid    := auth.uid();
  is_mgr boolean := public.can_manage_users();
  same_dept boolean;
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

  if new.assigned_to is distinct from old.assigned_to then
    if old.status = 'done' then
      raise exception 'A completed task cannot be reassigned'
        using errcode = '42501';
    end if;
    if not public.can_assign_to(new.assigned_to) then
      raise exception 'You can only assign tasks to people in your department, or to another department''s team lead'
        using errcode = '42501';
    end if;

    if not is_mgr and new.assigned_to is not null and new.assigned_to <> actor then
      select exists (
        select 1
        from public.profile_departments a
        join public.profile_departments b on a.department_id = b.department_id
        where a.profile_id = actor and b.profile_id = new.assigned_to
      ) into same_dept;
      -- Only the creator may send a task across departments.
      if not same_dept and actor is distinct from old.created_by then
        raise exception 'You can pass this task to people in your own department only'
          using errcode = '42501';
      end if;
    end if;

    -- A lead passing on a task they received keeps it on their board.
    if actor = old.assigned_to
       and actor is distinct from old.created_by
       and not (actor = any (old.handled_by))
    then
      new.handled_by := array_append(old.handled_by, actor);
    end if;
  end if;

  -- handled_by is maintained here only.
  if new.handled_by is distinct from old.handled_by
     and new.handled_by is distinct from array_append(old.handled_by, actor)
     and not is_mgr
  then
    new.handled_by := old.handled_by;
  end if;

  return new;
end;
$$;

-- Visibility and updates: leads in handled_by keep seeing the task. (A lead
-- passing a task down must still satisfy the update check on the new row;
-- BEFORE triggers run first, so handled_by already includes them.)
alter policy tasks_select on public.tasks using (
  (created_by = (select auth.uid()))
  or (assigned_to = (select auth.uid()))
  or ((select auth.uid()) = any (handled_by))
  or (select public.can_manage_users())
  or ((select public.is_team_lead()) and department_id in (select public.my_department_ids()))
);

alter policy tasks_update on public.tasks
  using (
    (created_by = (select auth.uid()))
    or (assigned_to = (select auth.uid()))
    or ((select auth.uid()) = any (handled_by))
    or (select public.can_manage_users())
    or ((select public.is_team_lead()) and department_id in (select public.my_department_ids()))
  )
  with check (
    (
      (created_by = (select auth.uid()))
      or (assigned_to = (select auth.uid()))
      or ((select auth.uid()) = any (handled_by))
      or (select public.can_manage_users())
      or ((select public.is_team_lead()) and department_id in (select public.my_department_ids()))
    )
    and public.can_assign_to(assigned_to)
  );

create or replace function public.can_view_task(t uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tasks tk
    where tk.id = t and (
      tk.created_by = auth.uid()
      or tk.assigned_to = auth.uid()
      or auth.uid() = any (tk.handled_by)
      or tk.department_id in (
        select department_id from public.profile_departments where profile_id = auth.uid()
      )
      or public.can_manage_users()
    )
  );
$$;

-- 4. Done notification for the creator and every lead in the chain.
create or replace function public.tasks_notify_done()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  doer text;
begin
  if new.status = 'done' and old.status is distinct from 'done' then
    select coalesce(nullif(full_name, ''), email) into doer
    from public.profiles where id = coalesce(new.assigned_to, auth.uid());
    insert into public.notifications (recipient_id, type, title, body, link, data)
    select r, 'task_done', 'Task completed',
           coalesce(doer, 'Someone') || ' finished "' || left(new.title, 120) || '"',
           '/tasks', jsonb_build_object('taskId', new.id)
    from (
      select distinct unnest(array_prepend(new.created_by, new.handled_by)) as r
    ) recipients
    where r is not null
      and r is distinct from auth.uid()
      and r is distinct from new.assigned_to;
  end if;
  return new;
end;
$$;

revoke execute on function public.tasks_notify_done() from public, anon, authenticated;

drop trigger if exists tasks_after_update_notify_done on public.tasks;
create trigger tasks_after_update_notify_done
  after update of status on public.tasks
  for each row execute function public.tasks_notify_done();

-- Live board updates: the board subscribes to UPDATEs of the specific tasks
-- it shows that someone else is working on (filtered by id, so other edits
-- send nothing). RLS decides who receives each change.
do $do$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='tasks') then
    alter publication supabase_realtime add table public.tasks;
  end if;
end $do$;

commit;
