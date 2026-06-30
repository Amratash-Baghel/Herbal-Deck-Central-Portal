# Tasks & Reporting

A personal kanban board that doubles as the company's end-of-day (EOD) reporting
system. Everyone manages their work as sticky notes; the same activity, captured
automatically, becomes each person's daily report — no separate form to fill in.

This is Phase 5 of the portal (the "Operations" phase from the roadmap).

---

## What it does

### My Board — every employee
A personal kanban with three columns: **To Do · In Progress · Done**.

- **Quick-add** — type a title and press Enter to drop a new sticky note into To
  Do (assigned to you, in your department).
- **Move** — drag a card between columns, or use the ◀ ▶ controls (the
  mobile-friendly move). Status updates optimistically.
- **Sticky-note cards** — gently tilted, lift on hover, and **colour-coded by
  department** (useful when someone belongs to more than one). Each card shows
  the title, description, assignee, who created it, the department, and an
  optional **deadline** (days remaining, or *overdue* in red).
- **Assign** — to yourself or anyone in your department(s). Assigning to someone
  else raises a notification for them through the existing notification system.
- **Edit / archive / delete** — open a card for the full editor; archive a
  finished task (kept for reporting) or delete your own.

### Team — department members
A read-only view of every task across the departments you belong to. Filter by
team member (and by department if you're in several), with a summary line: *X to
do, Y in progress, Z completed today.* You see everyone's tasks but only edit
your own — editing happens on the owner's board.

### Manage — admins + HR & Management
An all-departments dashboard:

- **Completion stats** — open tasks, completed today, completed this week, and
  how many people were active today.
- **No activity today** — anyone who hasn't moved a task is flagged.
- **Most completed (7 days)** — a small leaderboard.
- A fully **filterable** task view (department · person · status · date range).

### EOD Reports — auto-generated
Each person's report is built from their task activity, so it's accurate without
anyone filling in a form:

- **Created**, **Started** (moved to In Progress), **Completed**, and **Pending**
  counts for the day.
- The employee can add an optional **note** to finalise (submit) the report.
- **Today across the team** — a table of everyone you can see, with **idle people
  flagged**.
- **Recent reports** — submitted reports with their summary and note.

Visibility mirrors the rest of the module: your own, your department's, and — for
managers — everyone's.

---

## How it's built

### Data model (`supabase/migrations/0006_tasks_and_reporting.sql`)

| Table | Purpose |
| ----- | ------- |
| `tasks` | The cards: `title`, `description`, `status` (todo/in_progress/done), `created_by`, `assigned_to`, `department_id`, `deadline`, `archived`, `completed_at`, timestamps. |
| `task_activity` | An **append-only log** of every change (created / status_changed / assigned / archived) with the actor and time. This is the source of truth for reporting. |
| `eod_reports` | One row per employee per day: a snapshot of the activity counts (`auto_summary` JSON) plus the optional `manual_note`. |

**Triggers** keep things honest: a `before update` trigger maintains `updated_at`
and `completed_at`; `after insert`/`after update` triggers write the activity log
automatically, so it can never drift from what actually happened.

### Activity → reports

The log is bucketed by **Asia/Kolkata (IST)** so "today" matches the working day,
not UTC. Three `SECURITY DEFINER` helpers do the reporting maths without leaking
data:

- `eod_summary(emp, date)` — one person's counts for a day; returns `null` unless
  the caller may see that person's EOD (self / shared department / manager).
- `eod_overview(date)` — the same counts for **every** person the caller may see,
  in one round trip (powers the "today across the team" table and the idle flag).
- `can_view_task(task_id)` — backs the activity log's read policy.

### Security (Row Level Security)

- **tasks** — you can *see* your own, your assigned, your department's (managers:
  all); you can *edit* only your own or assigned (managers: all) — which is what
  makes other people's tasks read-only in the Team view; you can *delete* your own
  (managers: all).
- **task_activity** — readable when you can see the task; written only by the
  triggers (no INSERT policy).
- **eod_reports** — your own, shared-department colleagues', or all (managers);
  you only ever write your own.

### Integration

- Appears in the sidebar and on the dashboard tool grid.
- Assignment notifications reuse `lib/notifications.ts` and the realtime bell.
- Honours the existing department/role model (`my_department_ids()`,
  `can_manage_users()`).
- Matches the theme — semantic tokens, light/dark, pastel department colours.

---

## Routes & files

```
app/(dashboard)/tasks/
  layout.tsx        # sub-nav tabs (My Board / Team / Reports / Manage)
  page.tsx          # My Board
  team/page.tsx     # department view
  manage/page.tsx   # admin / HR dashboard
  reports/page.tsx  # EOD reports
  actions.ts        # create / move / update / archive / delete / saveEodNote

components/tasks/
  task-board.tsx          # My Board (DnD, quick-add, optimistic)
  task-card.tsx           # the sticky note
  task-detail-dialog.tsx  # view / edit a card
  task-list.tsx           # filterable read-only list (Team + Manage)
  eod-note-form.tsx       # finalise today's report
  types.ts                # Person, DeptRef
components/tasks-tabs.tsx  # the sub-navigation

lib/tasks.ts        # columns, status helpers, per-department note colours
lib/time.ts         # IST day helpers (localDateISO, daysUntil, isoDaysAgo)
```

---

## Notes & future work

- **Reporting is computed from the activity log**, not a nightly job — so any
  day's report is correct on demand. "Submitting" a report just stores the note
  and a snapshot; it isn't required for the data to exist.
- The Team and Manage views are **list** views (read-only) by design; the
  interactive kanban is the personal board.
- Possible follow-ups: a Team Lead tier between member and manager, recurring
  tasks, and scheduled EOD reminders.
