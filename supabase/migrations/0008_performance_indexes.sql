-- ===========================================================================
-- Migration 0008 — Performance indexes
-- ===========================================================================
-- Run this ONCE in the Supabase SQL Editor, AFTER migration 0007. Purely
-- additive (no table/column/policy changes) — adds indexes for query patterns
-- that existing indexes (from 0002–0007) don't cover. Each one is tied to a
-- specific, real query in the app rather than added speculatively:
--
--   1. task_activity(action, to_status, created_at)
--      Serves the "completed this week" query on /tasks/manage, which filters
--      by action + to_status + a date range with NO actor_id — the existing
--      (actor_id, created_at) index can't be used for that filter shape at
--      all, so this query was doing a full scan of task_activity.
--
--   2. eod_reports(report_date desc, created_at desc)
--      Serves the site-wide "recent reports" list on /tasks/reports (ordered
--      across ALL employees) and the daily EOD-reminder cron's per-day lookup
--      — both filter/sort by report_date alone. The existing composite is led
--      by employee_id, which doesn't help a query with no employee_id filter.
--
--   3. misc_payments(created_at desc)
--      /billing/petty-cash orders by created_at; the existing indexes on this
--      table are payment_date and category_id, neither of which is used here.
--
--   4. invoices(created_at desc)
--      /billing/clearing, /billing/post, and /billing/analytics all order (or
--      will, as data grows) by created_at across potentially every invoice;
--      no existing index covers that ordering.
-- ===========================================================================

create index if not exists task_activity_action_status_idx
  on public.task_activity(action, to_status, created_at);

create index if not exists eod_reports_recent_idx
  on public.eod_reports(report_date desc, created_at desc);

create index if not exists misc_payments_created_at_idx
  on public.misc_payments(created_at desc);

create index if not exists invoices_created_at_idx
  on public.invoices(created_at desc);

-- ===========================================================================
-- Done. No RLS or data changes — safe to run any time.
-- ===========================================================================
