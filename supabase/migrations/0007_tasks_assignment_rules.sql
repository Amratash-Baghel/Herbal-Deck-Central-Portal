-- ===========================================================================
-- Migration 0007 — Task assignment & ownership rules
-- ===========================================================================
-- Tightens who can do what to a task. Run ONCE in the Supabase SQL Editor,
-- AFTER migration 0006.
--
--   - Delete: only the creator (the app honours this; managers may archive).
--   - Assignment: a task can be assigned ONCE; after that only admins + HR &
--     Management may change (or clear) the assignee.
--   - Status moves: only the assignee may push a task forward — the creator can
--     put one in someone's To Do but can't move it on for them. Managers may
--     move anything. Unassigned tasks may be moved by anyone with edit access
--     (typically the creator).
--
-- The app's Server Actions enforce the same rules with friendly errors. This
-- trigger is the database-level guarantee that holds even if the UI is bypassed.
-- ===========================================================================

create or replace function public.tasks_enforce_rules()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor  uuid    := auth.uid();
  is_mgr boolean := public.can_manage_users();
begin
  -- Service-role / system updates (no auth context) are trusted; the app uses
  -- the anon client for these mutations, so this path is only hit by migrations
  -- and trusted server code.
  if actor is null then
    return new;
  end if;

  -- Status change: only the assignee may push forward (managers always).
  if new.status is distinct from old.status then
    if not is_mgr
       and old.assigned_to is not null
       and old.assigned_to is distinct from actor then
      raise exception 'Only the assignee can move this task'
        using errcode = '42501';
    end if;
  end if;

  -- Assignee change: locked once first set. Only managers can reassign (or
  -- unassign) afterwards.
  if new.assigned_to is distinct from old.assigned_to then
    if old.assigned_to is not null and not is_mgr then
      raise exception 'Only HR or admin can change the assignee of a task'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists tasks_before_update_rules on public.tasks;
create trigger tasks_before_update_rules
  before update on public.tasks
  for each row execute function public.tasks_enforce_rules();

-- Tighten the delete policy: only the creator may delete (managers can still
-- archive, which preserves history for reporting).
drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks
  for delete using (created_by = auth.uid());

-- ===========================================================================
-- Done. The app's UI hides controls that would violate these rules; this
-- migration is the safety net underneath.
-- ===========================================================================
