-- 0031 — Performance and retention (RLS evaluation, indexes, read receipts,
--        notification retention, storage limits, archive backstop).
--
-- DRAFT — NOT YET APPLIED. Review with the dry-run checks before and after:
--   scratchpad/0031-dryrun.sql   read-only EXPLAINs, retention counts, and
--                                row-visibility fingerprints per role
--   scratchpad/0031-notes.md     risk, expected gain and rollback per section
--
-- Every policy below was rewritten from the LIVE definitions in pg_policies
-- (read 2026-09-26), not from older migration files. Every function body was
-- taken from pg_get_functiondef() on the live database.
--
-- Evidence was measured read-only on production on 2026-09-26, with EXPLAIN
-- ANALYZE run as `authenticated` using real JWT claims inside a read-only
-- transaction. Data at that time: 2,641 tasks, 8,087 task_activity rows,
-- 298 eod_reports, 1,682 notifications, 162 messages and 34 profiles.
--
-- Apply off-hours (the pg_cron jobs below run at 03:05–03:20 IST). ALTER
-- POLICY takes an ACCESS EXCLUSIVE lock on each table until COMMIT. The whole
-- transaction should take about a second. lock_timeout makes it fail and roll
-- back rather than queue behind a long transaction and stall the app.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';


-- =============================================================================
-- 1. RLS: evaluate auth.uid() and the role helpers once per statement, not
--    once per row.
-- =============================================================================
--
-- Why. The helpers is_admin(), is_hr_management(), can_manage_users(),
-- can_manage_billing() and is_team_lead() are SECURITY DEFINER SQL functions,
-- so Postgres never inlines them. When a policy calls one bare, it runs once
-- for every candidate row, and each call scans profiles or
-- profile_departments. That is why the 34-row `profiles` table shows
-- 1,019,929 sequential scans in pg_stat_user_tables. Wrapping a call in
-- `(select …)` turns it into an InitPlan, which is evaluated once per
-- statement.
--
-- Measured before → after. "After" is the same query as service_role with the
-- new predicate written out, which is exactly what the policy will evaluate.
--   admin    dashboard board: tasks, open, ordered by deadline
--              322.1 ms → 1.46 ms   (buffers 2,630 → 256)
--   team lead  tasks done in last 30 days (/reporting)
--              329.8 ms → 3.5 ms    (buffers 4,296 → 453)
--   team lead  eod_reports list, LIMIT 300 (/reporting/eod)
--              183.8 ms → 2.5 ms    (buffers 2,360 → 398)
--   pg_stat_statements, 46 days: the open-tasks board query averages
--   1,641 ms with a 7,250 ms max, against the 8 s `authenticated`
--   statement_timeout. Cost grows linearly with table size, at about
--   0.1 ms per row for admins, HR and team leads.
--
-- Why this is semantically identical:
--   * Every wrapped expression takes no argument from the row: auth.uid(),
--     is_admin(), can_manage_users(), can_manage_billing() and is_team_lead().
--     All of them are STABLE, so within one statement they return the same
--     value for every row. Evaluating once gives the same result.
--   * Helpers that DO take row columns are left per-row and untouched:
--     can_assign_to(assigned_to), can_create_calendar_event(…),
--     can_schedule_task(…), is_conversation_admin(conversation_id) and
--     is_conversation_participant() in WITH CHECK clauses.
--   * `x IN (SELECT public.my_department_ids())` is already evaluated once as
--     a hashed SubPlan, so it is kept as is.
--   * Verified before writing this file. For one admin, one HR user, one team
--     lead and one employee, I compared the rows visible under the current
--     policies with the rows visible under the new predicates, across all 18
--     RLS tables. The count and md5 of the visible primary keys were identical
--     for every table and role (scratchpad/0031-dryrun.sql, section B).
--   * Also checked on a local copy of this schema (0002–0030 plus this file,
--     whose policies hash identically to production's). For 7 identities, 57
--     INSERT/UPDATE/DELETE attempts each gave the same row counts and RLS
--     rejections before and after. That run is how the profiles_select
--     exception below was found.
--
-- ALTER POLICY keeps each policy's name, command, roles and PERMISSIVE flag.
-- Only the expressions change.

-- ---- tasks ------------------------------------------------------------------
alter policy tasks_select on public.tasks
  using (
    (created_by = (select auth.uid()))
    or (assigned_to = (select auth.uid()))
    or (select public.can_manage_users())
    or ((select public.is_team_lead()) and (department_id in (select public.my_department_ids())))
  );

alter policy tasks_update on public.tasks
  using (
    (created_by = (select auth.uid()))
    or (assigned_to = (select auth.uid()))
    or (select public.can_manage_users())
    or ((select public.is_team_lead()) and (department_id in (select public.my_department_ids())))
  )
  with check (
    (
      (created_by = (select auth.uid()))
      or (assigned_to = (select auth.uid()))
      or (select public.can_manage_users())
      or ((select public.is_team_lead()) and (department_id in (select public.my_department_ids())))
    )
    and public.can_assign_to(assigned_to)
  );

alter policy tasks_insert on public.tasks
  with check (
    (created_by = (select auth.uid()))
    and ((department_id in (select public.my_department_ids())) or (select public.can_manage_users()))
    and public.can_assign_to(assigned_to)
  );

alter policy tasks_delete on public.tasks
  using (created_by = (select auth.uid()));

-- ---- task_activity ----------------------------------------------------------
-- Measured: admin weekly-done query (/tasks/manage) takes 87.5 ms with
-- 1,057 buffers for 168 rows.
alter policy task_activity_select on public.task_activity
  using (
    (select public.can_manage_users())
    or (actor_id = (select auth.uid()))
    or ((select public.is_team_lead()) and (department_id in (select public.my_department_ids())))
    or (
      (task_id is not null)
      and exists (
        select 1 from public.tasks t
        where t.id = task_activity.task_id
          and (t.created_by = (select auth.uid()) or t.assigned_to = (select auth.uid()))
      )
    )
  );

-- ---- task_schedules ---------------------------------------------------------
alter policy task_schedules_select on public.task_schedules
  using (
    (created_by = (select auth.uid()))
    or (select public.can_manage_users())
    or ((select public.is_team_lead()) and (department_id in (select public.my_department_ids())))
  );

alter policy task_schedules_insert on public.task_schedules
  with check (
    (created_by = (select auth.uid()))
    and ((select public.can_manage_users()) or (department_id in (select public.my_department_ids())))
    and public.can_schedule_task(target_type, target_person, target_department)
  );

alter policy task_schedules_update on public.task_schedules
  using      ((created_by = (select auth.uid())) or (select public.can_manage_users()))
  with check ((created_by = (select auth.uid())) or (select public.can_manage_users()));

alter policy task_schedules_delete on public.task_schedules
  using ((created_by = (select auth.uid())) or (select public.can_manage_users()));

-- ---- eod_reports / activity_logs --------------------------------------------
-- The EXISTS is kept exactly as it is live. The planner already turns it into
-- a hashed SubPlan; only the auth.uid() inside it is wrapped.
alter policy eod_select on public.eod_reports
  using (
    (employee_id = (select auth.uid()))
    or (select public.can_manage_users())
    or (
      (select public.is_team_lead())
      and exists (
        select 1
        from public.profile_departments a
        join public.profile_departments b on a.department_id = b.department_id
        where a.profile_id = (select auth.uid())
          and b.profile_id = eod_reports.employee_id
      )
    )
  );

alter policy eod_insert on public.eod_reports
  with check (employee_id = (select auth.uid()));

alter policy eod_update on public.eod_reports
  using      (employee_id = (select auth.uid()))
  with check (employee_id = (select auth.uid()));

alter policy activity_logs_select on public.activity_logs
  using (
    (employee_id = (select auth.uid()))
    or (select public.can_manage_users())
    or (
      (select public.is_team_lead())
      and exists (
        select 1
        from public.profile_departments a
        join public.profile_departments b on a.department_id = b.department_id
        where a.profile_id = (select auth.uid())
          and b.profile_id = activity_logs.employee_id
      )
    )
  );

-- ---- invoices / misc_payments -----------------------------------------------
alter policy invoices_select on public.invoices
  using ((select public.can_manage_billing()) or (department_id in (select public.my_department_ids())));

alter policy invoices_insert on public.invoices
  with check (created_by = (select auth.uid()));

alter policy invoices_update on public.invoices
  using      ((select public.can_manage_billing()))
  with check ((select public.can_manage_billing()));

alter policy invoices_delete on public.invoices
  using (
    (select public.is_admin())
    or ((created_by = (select auth.uid())) and (status = 'pending'::public.invoice_status))
  );

alter policy misc_all on public.misc_payments
  using      ((select public.can_manage_billing()))
  with check ((select public.can_manage_billing()));

-- ---- notifications ----------------------------------------------------------
alter policy notifications_select on public.notifications
  using (recipient_id = (select auth.uid()));

alter policy notifications_update on public.notifications
  using      (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

alter policy notifications_delete on public.notifications
  using (recipient_id = (select auth.uid()));

-- ---- profiles ---------------------------------------------------------------
-- profiles_select is deliberately NOT wrapped. It stays
-- `auth.uid() IS NOT NULL`, and the advisor will keep this one finding.
-- The WITH CHECK of profiles_update reads `profiles` in a subquery. If
-- profiles_select contains a SubLink, as `(select auth.uid())` does,
-- PostgreSQL's RLS recursion guard rejects every UPDATE on profiles with
-- "infinite recursion detected in policy for relation profiles". Reproduced
-- on a local copy of this schema: all 7 test identities, 3 profile-update
-- cases each. The per-row cost left behind is one auth.uid() call on a table
-- of 34–45 rows, which is not measurable.

alter policy profiles_insert on public.profiles
  with check ((select public.can_manage_users()));

alter policy profiles_update on public.profiles
  using ((id = (select auth.uid())) or (select public.can_manage_users()))
  with check (
    (select public.can_manage_users())
    or (
      (id = (select auth.uid()))
      and (role = (select p1.role from public.profiles p1 where p1.id = (select auth.uid())))
    )
  );

alter policy profiles_delete on public.profiles
  using ((select public.can_manage_users()));

-- ---- calendar_events --------------------------------------------------------
alter policy calendar_events_select on public.calendar_events
  using (
    visible_to_all
    or (created_by = (select auth.uid()))
    or (
      (department_ids is not null)
      and exists (
        select 1 from public.profile_departments pd
        where pd.profile_id = (select auth.uid())
          and pd.department_id = any (calendar_events.department_ids)
      )
    )
  );

alter policy calendar_events_insert on public.calendar_events
  with check (
    (created_by = (select auth.uid()))
    and public.can_create_calendar_event(event_type, department_ids, visible_to_all)
  );

alter policy calendar_events_update on public.calendar_events
  using (created_by = (select auth.uid()))
  with check (
    (created_by = (select auth.uid()))
    and public.can_create_calendar_event(event_type, department_ids, visible_to_all)
  );

alter policy calendar_events_delete on public.calendar_events
  using ((created_by = (select auth.uid())) or (select public.can_manage_users()));

-- ---- departments / invoice_categories / profile_departments -----------------
-- multiple_permissive_policies lint, 15 findings. Each of these three tables
-- has a *_read SELECT policy and a *_write policy FOR ALL. PostgreSQL ORs
-- every permissive policy that applies to a command, so SELECT currently
-- evaluates both `auth.uid() IS NOT NULL` and the write helper, per row.
--
-- Merge, which is provably equivalent (same roles, {public}, on both
-- policies):
--   SELECT           the new *_read USING is the literal OR of the two old
--                    SELECT expressions. It is the same predicate by
--                    construction, not just implied by it.
--   INSERT/UPDATE/DELETE  the FOR ALL policy becomes three per-command
--                    policies with its exact USING / WITH CHECK. For these
--                    commands nothing else changed: there was no other
--                    permissive policy for them.
-- Measured nested cost: every eod_reports/activity_logs team-lead check read
-- profile_departments under `can_manage_users() OR auth.uid() IS NOT NULL`,
-- once per row.

alter policy departments_read on public.departments
  using (((select auth.uid()) is not null) or (select public.is_admin()));
drop policy if exists departments_write  on public.departments;
drop policy if exists departments_insert on public.departments;
drop policy if exists departments_update on public.departments;
drop policy if exists departments_delete on public.departments;
create policy departments_insert on public.departments as permissive for insert to public
  with check ((select public.is_admin()));
create policy departments_update on public.departments as permissive for update to public
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy departments_delete on public.departments as permissive for delete to public
  using ((select public.is_admin()));

alter policy categories_read on public.invoice_categories
  using (((select auth.uid()) is not null) or (select public.can_manage_billing()));
drop policy if exists categories_write  on public.invoice_categories;
drop policy if exists categories_insert on public.invoice_categories;
drop policy if exists categories_update on public.invoice_categories;
drop policy if exists categories_delete on public.invoice_categories;
create policy categories_insert on public.invoice_categories as permissive for insert to public
  with check ((select public.can_manage_billing()));
create policy categories_update on public.invoice_categories as permissive for update to public
  using ((select public.can_manage_billing())) with check ((select public.can_manage_billing()));
create policy categories_delete on public.invoice_categories as permissive for delete to public
  using ((select public.can_manage_billing()));

alter policy profdept_read on public.profile_departments
  using (((select auth.uid()) is not null) or (select public.can_manage_users()));
drop policy if exists profdept_write  on public.profile_departments;
drop policy if exists profdept_insert on public.profile_departments;
drop policy if exists profdept_update on public.profile_departments;
drop policy if exists profdept_delete on public.profile_departments;
create policy profdept_insert on public.profile_departments as permissive for insert to public
  with check ((select public.can_manage_users()));
create policy profdept_update on public.profile_departments as permissive for update to public
  using ((select public.can_manage_users())) with check ((select public.can_manage_users()));
create policy profdept_delete on public.profile_departments as permissive for delete to public
  using ((select public.can_manage_users()));

-- ---- chat: conversations / conversation_participants / messages -------------
-- is_conversation_participant(conversation_id) takes a row column, so it
-- cannot be hoisted. It runs once per row: 26 µs/row, measured as 2.24 ms
-- and 213 buffers for an employee reading all 85 conversation_participants
-- rows. use-live-chat.ts reads that table and `conversations` WITHOUT a filter
-- on every refresh; the last 24 h show 753 and 392 such requests. At 45 users
-- there will be about 2,000 participant rows, so about 50 ms per refresh.
--
-- my_conversation_ids() returns the caller's conversation ids once, as a set.
-- `x IN (SELECT my_conversation_ids())` then becomes one hashed SubPlan. The
-- same list read measured 0.14 ms in the inline form.
-- Equivalent: is_conversation_participant(c) is
--   EXISTS(cp WHERE cp.conversation_id = c AND cp.profile_id = auth.uid()),
-- and for a non-null c that is exactly c ∈ {cp.conversation_id WHERE
-- cp.profile_id = auth.uid()}. conversations.id and *.conversation_id are
-- NOT NULL, so NULL handling does not arise.
-- Realtime: realtime.apply_rls checks each subscriber by PK
-- (`select exists(select 1 from <table> where pk = …)`). That check goes from
-- one PK probe to a scan of the subscriber's own participant rows, each inside
-- one definer call. The extra cost is a few µs per event, far less than the
-- per-row saving on list reads. See notes §1.
-- WITH CHECK uses of is_conversation_participant() (messages_insert) stay
-- per-row, because an INSERT only ever checks one row.

create or replace function public.my_conversation_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select cp.conversation_id
  from public.conversation_participants cp
  where cp.profile_id = auth.uid();
$$;

-- Same exposure rule as 0030: nothing SECURITY DEFINER for PUBLIC/anon.
-- Policies call this with the invoker's privileges, so `authenticated` needs
-- EXECUTE, exactly like is_conversation_participant().
revoke execute on function public.my_conversation_ids() from public, anon;
grant  execute on function public.my_conversation_ids() to authenticated, service_role;

alter policy conversations_select on public.conversations
  using (id in (select public.my_conversation_ids()));

alter policy conv_participants_select on public.conversation_participants
  using (conversation_id in (select public.my_conversation_ids()));

alter policy messages_select on public.messages
  using (conversation_id in (select public.my_conversation_ids()));

alter policy conversations_insert on public.conversations
  with check (created_by = (select auth.uid()));

alter policy conv_participants_delete on public.conversation_participants
  using (public.is_conversation_admin(conversation_id) or (profile_id = (select auth.uid())));

alter policy messages_insert on public.messages
  with check ((sender_id = (select auth.uid())) and public.is_conversation_participant(conversation_id));

-- reactions_* / pins_* have roles {authenticated}; ALTER POLICY keeps that.
alter policy reactions_insert on public.message_reactions
  with check (
    (profile_id = (select auth.uid()))
    and exists (
      select 1 from public.messages m
      where m.id = message_reactions.message_id and m.deleted_at is null
    )
  );

alter policy reactions_delete on public.message_reactions
  using (
    (profile_id = (select auth.uid()))
    and exists (select 1 from public.messages m where m.id = message_reactions.message_id)
  );

alter policy pins_insert on public.conversation_pins
  with check (
    (pinned_by = (select auth.uid()))
    and exists (
      select 1 from public.messages m
      where m.id = conversation_pins.message_id and m.deleted_at is null
    )
  );

alter policy pins_delete on public.conversation_pins
  using (
    exists (
      select 1 from public.messages m
      where m.id = conversation_pins.message_id
        and (conversation_pins.pinned_by = (select auth.uid()) or public.is_conversation_admin(m.conversation_id))
    )
  );

-- Left unchanged on purpose. None calls auth.*() directly, and each helper
-- they use takes a row column:
--   conversations_update/delete, conv_participants_insert/update
--     is_conversation_admin(id)
--   reactions_read, pins_read
--     EXISTS on messages; these inherit the faster messages_select above


-- =============================================================================
-- 2. Indexes
-- =============================================================================
--
-- Plain CREATE INDEX, not CONCURRENTLY: CONCURRENTLY cannot run inside this
-- transaction, and the largest table (task_activity, 8k rows) builds in
-- milliseconds. Each build holds a SHARE lock, which blocks writes only.
--
-- 2a. Hot-query indexes. The queries are taken from pg_stat_statements
--     (46 days) and the app code.

-- Open-task boards: dashboard "Across the company", /reporting/employees,
-- tasks/reports and the eod-finalize cron all filter on
-- `archived = false AND status <> 'done'`, and the dashboard orders by
-- deadline. The filter matches 20 of 2,641 rows today, yet every call
-- sequential-scans the whole table. pg_stat_statements: 32 calls, mean
-- 1,641 ms, max 7,250 ms; 38 calls, mean 367 ms.
-- Partial index: PostgREST binds filter values as parameters, but this plan is
-- so much cheaper that the plan cache keeps choosing custom plans, which use
-- the index. 0031-dryrun.sql §C checks this.
create index if not exists tasks_open_deadline_idx
  on public.tasks (deadline)
  where not archived and status <> 'done'::public.task_status;

-- /tasks/manage and /tasks/team: `archived = false ORDER BY created_at DESC`.
-- 24 + 42 calls at 338–555 ms mean. The index only becomes selective once done
-- tasks are archived again (section 6; 2,199 are overdue for archiving).
create index if not exists tasks_active_created_idx
  on public.tasks (created_at desc)
  where not archived;

-- Reporting `status = 'done' AND completed_at >= …` (185 calls, mean 417 ms,
-- max 2,691 ms), and the history lists
-- `archived AND status = 'done' ORDER BY completed_at DESC LIMIT 50/200`.
-- A composite (not partial) index, so it also serves generic plans.
create index if not exists tasks_status_completed_idx
  on public.tasks (status, completed_at);

-- /tasks/manage weekly throughput:
-- `action = … AND to_status = … AND created_at >= …`
-- (26 calls, mean 145 ms). Today it walks task_activity_actor_idx by
-- created_at and filters out 2 of every 3 rows.
create index if not exists task_activity_action_status_created_idx
  on public.task_activity (action, to_status, created_at);

-- /reporting/eod (LIMIT 300) and /tasks/reports (LIMIT 50):
-- `ORDER BY report_date DESC, created_at DESC`. 765 calls, mean 106 ms,
-- currently a full sort of every visible row. The index lets the LIMIT stop
-- early.
create index if not exists eod_reports_date_idx
  on public.eod_reports (report_date desc, created_at desc);

-- 2b. Foreign keys without a covering index (unindexed_foreign_keys lint,
--     8 findings). Without one, deleting or re-keying the parent row
--     sequential-scans the child table.
--     messages.reply_to_id matters most: deleting a conversation CASCADEs to
--     its messages, and each deleted message runs `UPDATE messages SET
--     reply_to_id = NULL WHERE reply_to_id = $1` (ON DELETE SET NULL). That is
--     O(n²) on a table that will hold hundreds of thousands of rows. The index
--     is partial, because most messages are not replies. The other seven are
--     on small, slowly growing tables and cost almost nothing to maintain.
create index if not exists messages_reply_to_idx
  on public.messages (reply_to_id) where reply_to_id is not null;
create index if not exists message_reactions_profile_idx
  on public.message_reactions (profile_id);
create index if not exists conversation_pins_pinned_by_idx
  on public.conversation_pins (pinned_by);
create index if not exists conversations_created_by_idx
  on public.conversations (created_by);
create index if not exists invoices_cleared_by_idx
  on public.invoices (cleared_by) where cleared_by is not null;
create index if not exists misc_payments_created_by_idx
  on public.misc_payments (created_by);
create index if not exists task_schedules_target_person_idx
  on public.task_schedules (target_person) where target_person is not null;
create index if not exists task_schedules_target_department_idx
  on public.task_schedules (target_department) where target_department is not null;

-- 2c. Indexes the advisor marks unused (unused_index, 7 findings). ALL KEPT.
--     None backs a PK or UNIQUE constraint. Reasons, per index:
--   misc_payments_category_idx   covers FK misc_payments_category_id_fkey;
--                                dropping re-creates an unindexed-FK finding
--   invoices_category_idx        covers FK invoices_category_id_fkey (same)
--   calendar_events_creator_idx  covers FK calendar_events_created_by_fkey
--                                (ON DELETE CASCADE) and the
--                                `created_by = auth.uid()` policy arm
--   task_schedules_creator_idx   covers FK task_schedules_created_by_fkey
--                                (ON DELETE CASCADE)
--   task_schedules_dept_idx      covers FK task_schedules_department_id_fkey
--                                (RESTRICT)
--   invoices_status_idx          `invoices` has 0 rows today, so "unused" is
--                                no evidence. /billing/clearing filters by
--                                status. At about 9k rows a year it will be
--                                used.
--   misc_payments_date_idx       misc_payments has 1 row. The petty-cash page
--                                orders by payment_date. 16 KB.
--   Each is 16 KB on tables with fewer than 10 writes a day, so dropping them
--   saves nothing measurable.
-- Also kept: activity_logs_employee_date_idx and eod_reports_employee_idx.
-- The stress report suggests dropping them because they duplicate UNIQUE
-- indexes in the other sort direction. They are not unused (846 and 1,611
-- scans). The activity_logs one never costs anything on the hot path,
-- because record_activity's upserts are HOT (5,225 of 5,228) and do not touch
-- indexes. The gain is below measurement, so they stay.


-- =============================================================================
-- 3. Chat read receipts: write nothing when nothing changes.
-- =============================================================================
--
-- Why. mark_chat_read_through() ran
--   UPDATE … SET last_read_at = greatest(last_read_at, stamp)
-- on every call. Even when the value did not change, that writes a new row
-- version and a WAL record, and Realtime sends a conversation_participants
-- UPDATE to every chat subscriber. use-live-chat.ts answers each one with a
-- full refresh() of about 8 REST calls. That is the O(n²) read-receipt storm:
-- about 2,070 realtime messages for one message in a 45-person group, and
-- about 150 REST calls in one viewer's browser for one message in a
-- 20-person group. pg_stat_user_tables already shows 516 participant UPDATEs
-- against 162 messages.
--
-- Change. Update only when the stored value would move forward. last_read_at
-- is NOT NULL, so `greatest(last_read_at, stamp)` differs from last_read_at
-- exactly when last_read_at < stamp. The stored result is identical and the
-- no-op write disappears. Signature, SECURITY DEFINER, search_path, language,
-- volatility and the error messages are copied from the live definition.
-- CREATE OR REPLACE keeps the owner and the ACL, including 0030's revoke from
-- PUBLIC/anon.
create or replace function public.mark_chat_read_through(conv_id uuid, message_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare stamp timestamptz;
begin
  if auth.uid() is null or not public.is_conversation_participant(conv_id) then raise exception 'Conversation unavailable'; end if;
  select created_at into stamp from public.messages m where m.id = message_id and m.conversation_id = conv_id;
  if stamp is null then raise exception 'Message unavailable'; end if;
  update public.conversation_participants set last_read_at = stamp
    where conversation_id = conv_id and profile_id = auth.uid()
      and last_read_at < stamp;
end;
$function$;

-- mark_conversation_read(conv_id) is the fallback path in use-live-chat.ts and
-- the (unmounted) chat-client.tsx. It always writes now(), so the stored value
-- always changes, but the observable read state does not change unless a
-- message exists after the current last_read_at. Both consumers measure
-- against message times:
--   unread_counts()  counts m.created_at > last_read_at
--   "Seen by"        tests last_read_at >= m.created_at
-- The write is skipped when no message is newer than last_read_at.
-- The only visible difference is a race fix. A message whose insert
-- transaction started before now() but committed after this call used to be
-- marked read unseen. Now it stays unread.
create or replace function public.mark_conversation_read(conv_id uuid)
 returns void
 language sql
 security definer
 set search_path to 'public'
as $function$
  update public.conversation_participants cp
  set last_read_at = now()
  where cp.conversation_id = conv_id and cp.profile_id = auth.uid()
    and exists (
      select 1 from public.messages m
      where m.conversation_id = conv_id and m.created_at > cp.last_read_at
    );
$function$;


-- =============================================================================
-- 4. Retention (pg_cron)
-- =============================================================================
--
-- pg_cron 1.6.4 is available on this project (pg_available_extensions) but
-- not installed. It is included on the Free plan. The jobs run inside the
-- database, so they need no HTTP call and no CRON_SECRET. The Vercel crons
-- are currently NOT running in production: there has never been an
-- eod_reminder or task_overdue row, and nothing has been archived since
-- 2026-08-18.
--
-- The delete lives in a SECURITY DEFINER function, following the pattern of
-- archive_stale_done_tasks(). It can also be called over RPC by the service
-- role, which gives the existing Vercel cron a fallback if pg_cron is ever
-- disabled.
--
-- Scope: only notifications, which are inbox items and not business records,
-- plus pg_cron's own run log. No tasks, invoices, messages, attendance
-- (activity_logs), EOD reports or task history are touched.
--
-- Measured now: 1,682 notifications (784 kB); 1,461 are eod_submitted, 1,155
-- of them unread. First run deletes 961 rows (57 %):
--   read, created more than 60 days ago                     194
--   unread eod_submitted/eod_reminder, older than 30 days   767
-- At 45 users (about 3,300 notifications/day) this caps the table at about
-- 60 days of history, instead of growing about 1.6 MB/day without limit.
-- eod_reminder has no rows yet; it is the same kind of EOD alert, so it gets
-- the same window.
create extension if not exists pg_cron with schema pg_catalog;
-- These two grants are Supabase's documented pg_cron setup. They are a no-op
-- (at most a WARNING) if the grants already exist.
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

create or replace function public.purge_stale_notifications()
returns integer
language sql
security definer
set search_path = ''
as $$
  with purged as (
    delete from public.notifications n
    where (n.read_at is not null and n.created_at < now() - interval '60 days')
       or (n.read_at is null
           and n.type in ('eod_submitted', 'eod_reminder')
           and n.created_at < now() - interval '30 days')
    returning 1
  )
  select count(*)::int from purged;
$$;

revoke execute on function public.purge_stale_notifications() from public, anon, authenticated;
grant  execute on function public.purge_stale_notifications() to service_role;

-- 21:35 UTC is 03:05 IST, when no one is connected. `notifications` is in the
-- supabase_realtime publication, so the DELETEs pass through WAL decoding.
-- At night there are no subscribers to fan out to. cron.schedule() with a
-- job name upserts, so re-running this migration is safe.
select cron.schedule('hd-purge-stale-notifications', '35 21 * * *',
  $$select public.purge_stale_notifications()$$);

-- pg_cron logs every run to cron.job_run_details and never prunes it. Keep
-- 14 days.
select cron.schedule('hd-purge-cron-history', '45 21 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '14 days'$$);


-- =============================================================================
-- 5. Storage: bounds on the invoice buckets and a precise orphan finder
-- =============================================================================
--
-- Why. `invoices` and `payment-proofs` have no file_size_limit and no MIME
-- allow-list. Storage is the first Free-plan quota expected to break (1 GB).
--
-- Consistency with the app (app/(dashboard)/billing/actions.ts):
--   * Every upload goes through a Server Action. next.config.ts caps the body
--     at 6 MB (`serverActions.bodySizeLimit: "6mb"`), so no app upload can
--     exceed 6 MB. The 6 MB limit therefore rejects nothing the app can send
--     today. Lower it to 3 MB once the app shrinks payment proofs client-side.
--   * The pickers accept "application/pdf,image/*" (post-invoice-form.tsx,
--     invoice-manage-actions.tsx). clearInvoice() rejects anything else, the
--     signature is written as image/png, and an empty file.type falls back
--     to application/pdf. Supabase Storage supports the image/* wildcard.
--   Heads-up for the app: createPostedInvoice() and uploadSignedInvoice()
--   ignore the upload error. A file that fails these checks (say a .docx
--   picked through "All files") is dropped silently. See notes §5.
update storage.buckets
   set file_size_limit    = 6291456,  -- 6 MB, equal to the Server Action body cap
       allowed_mime_types = array['application/pdf', 'image/*']
 where id in ('invoices', 'payment-proofs');

-- Orphans. Deleting an invoice leaves its files behind. The bucket holds one
-- 8.7 KB PDF while `invoices` has 0 rows. The app's path convention
-- identifies orphans exactly:
--   invoices        <invoice_id>/source-<ms>.<ext>   createPostedInvoice
--                   <invoice_id>/signed-<ms>.<ext>   uploadSignedInvoice
--                   <invoice_id>/signature.png       saveInvoiceSignature
--   payment-proofs  <invoice_id>/proof-<ms>.<ext>    clearInvoice
-- An object is an orphan if and only if it matches one of these shapes, its
-- first segment is not an existing invoices.id, and it is older than a grace
-- period. The invoice row is always committed before its file is uploaded,
-- so the grace period only covers in-flight races.
-- Files for an existing invoice that were replaced (older source-/signed-/
-- proof-) are deliberately NOT returned. They may be the original documents.
--
-- It only LISTS orphans. Deleting rows from storage.objects in SQL is blocked
-- by the storage.protect_delete() trigger, and would leave the S3 blob behind
-- anyway. The service-role cron must remove them through the Storage API,
-- which is an app change (snippet in notes §5).
create or replace function public.invoice_storage_orphans(min_age interval default interval '1 day')
returns table (bucket text, path text, size_bytes bigint, uploaded_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select o.bucket_id, o.name, (o.metadata ->> 'size')::bigint, o.created_at
  from storage.objects o
  where (
          (o.bucket_id = 'invoices'
           and o.name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(source-[0-9]+\.[^/]+|signed-[0-9]+\.[^/]+|signature\.png)$')
       or (o.bucket_id = 'payment-proofs'
           and o.name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/proof-[0-9]+\.[^/]+$')
        )
    and o.created_at < now() - greatest(min_age, interval '1 hour')
    and not exists (
      select 1 from public.invoices i
      where i.id::text = split_part(o.name, '/', 1)
    )
  order by o.created_at;
$$;

revoke execute on function public.invoice_storage_orphans(interval) from public, anon, authenticated;
grant  execute on function public.invoice_storage_orphans(interval) to service_role;


-- =============================================================================
-- 6. Archive backstop for done tasks (from the stress report, §5)
-- =============================================================================
--
-- Why. app/api/cron/eod-finalize calls archive_stale_done_tasks() every day,
-- but the Vercel crons are not running (nothing archived since 2026-08-18).
-- 2,199 done tasks older than 7 days still sit on every open board, and
-- /tasks/manage returns about 2,338 rows. That drives the 390 KB RSC payloads
-- in the server report and the 570-card /tasks board in the client report.
-- It also keeps tasks_active_created_idx (§2) from being selective.
--
-- This runs the same function inside the database. It is idempotent: it only
-- touches `status = 'done' AND NOT archived AND completed_at < now() - 7 days`,
-- so it is harmless if the Vercel cron starts working again. Archiving is a
-- flag, not a deletion; archived tasks stay in History and in reporting.
-- tasks_enforce_rules() lets a NULL auth.uid() through ("trusted
-- server/migration path") and tasks_log_update() records 'archived' with the
-- task creator as actor, exactly as the service-role run did on 08-12 and
-- 08-18.
-- USER-VISIBLE: the first run moves about 2,199 cards off the boards into
-- History. That is the designed behaviour, but announce it. To leave it out,
-- delete this statement before applying, or run
-- `select cron.unschedule('hd-archive-stale-done-tasks');` afterwards.
-- 21:50 UTC is 03:20 IST. The finalize-attendance and materialize-schedules
-- backstops are deliberately NOT scheduled; see notes §6.
select cron.schedule('hd-archive-stale-done-tasks', '50 21 * * *',
  $$select public.archive_stale_done_tasks()$$);


commit;
