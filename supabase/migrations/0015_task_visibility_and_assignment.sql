-- ===========================================================================
-- Migration 0015 — Task visibility & assignment (role-scoped)
-- ===========================================================================
-- Run this ONCE in the Supabase SQL Editor, AFTER migration 0014. In-place
-- policy/trigger changes; safe on the live database.
--
-- Enforces the role model at the DATABASE level (not just the UI):
--
--   VISIBILITY (who can SEE a task):
--     - employee   → only their own (created by or assigned to them)
--     - team_lead  → every task in their department(s)
--     - admin / HR → all tasks, everywhere
--
--   ASSIGNMENT (who a task may be assigned TO):
--     - employee   → only themselves (or unassigned)
--     - team_lead  → anyone in their department(s) (or themselves / unassigned)
--     - admin / HR → anyone
--
-- Previously EVERY employee could see their whole department's tasks, and the
-- "assign once, managers-only reassign" rule blocked team leads from assigning
-- at all. Both are fixed here.
--
-- (payment_proof_path already exists on invoices from migration 0002 — no
-- column change needed for the invoice-clearing work.)
-- ===========================================================================

-- Helper: may the current user assign a task TO `target`?
create or replace function public.can_assign_to(target uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select
    target is null                       -- unassigned is always fine
    or target = auth.uid()               -- assign to yourself
    or public.can_manage_users()         -- admins + HR: anyone
    or (
      public.is_team_lead()              -- team leads: their department(s)
      and exists (
        select 1
        from public.profile_departments a
        join public.profile_departments b on a.department_id = b.department_id
        where a.profile_id = auth.uid() and b.profile_id = target
      )
    );
$$;

-- VISIBILITY -----------------------------------------------------------------
drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks
  for select using (
    created_by = auth.uid()
    or assigned_to = auth.uid()
    or public.can_manage_users()
    or (public.is_team_lead() and department_id in (select public.my_department_ids()))
  );

-- CREATE: your own task, in a department you belong to (managers anywhere), and
-- the assignee must be someone you're allowed to assign to.
drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks
  for insert with check (
    created_by = auth.uid()
    and (department_id in (select public.my_department_ids()) or public.can_manage_users())
    and public.can_assign_to(assigned_to)
  );

-- EDIT: creator, assignee, a manager, or the department's team lead. Any change
-- to the assignee must satisfy can_assign_to().
drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks
  for update using (
    created_by = auth.uid()
    or assigned_to = auth.uid()
    or public.can_manage_users()
    or (public.is_team_lead() and department_id in (select public.my_department_ids()))
  ) with check (
    (
      created_by = auth.uid()
      or assigned_to = auth.uid()
      or public.can_manage_users()
      or (public.is_team_lead() and department_id in (select public.my_department_ids()))
    )
    and public.can_assign_to(assigned_to)
  );

-- Rules trigger: replace "assign once (managers-only reassign)" with the
-- capability check, and let a department's team lead move its tasks.
create or replace function public.tasks_enforce_rules()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor  uuid    := auth.uid();
  is_mgr boolean := public.can_manage_users();
begin
  if actor is null then
    return new; -- trusted server/migration path
  end if;

  -- Status move: the assignee, a manager, or the department's team lead.
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

  -- Assignee change must be to someone you're allowed to assign to.
  if new.assigned_to is distinct from old.assigned_to then
    if not public.can_assign_to(new.assigned_to) then
      raise exception 'You can only assign tasks to people in your department'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

-- ===========================================================================
-- Done. Task visibility and assignment are now enforced by RLS + trigger, so
-- the boundaries hold even if the UI is bypassed.
-- ===========================================================================
