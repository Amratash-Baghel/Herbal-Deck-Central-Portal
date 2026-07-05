# Changelog

All notable changes to the Herbal Deck Portal are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.10.1] — 2026-07-05

Follow-up fixes to the 0.10.0 dropdown and colour work: the notification bell
now escapes its stacking context too, the colour picker clearly shows the
selected swatch and has a cleaner palette, and per-employee colour is now the
note's own background (not a dot beside the name).

### Fixed

- **Notification dropdown still bled into the content behind it.** The 0.10.0
  fix covered the task popovers but the bell's panel was still a plain
  `fixed` element at `z-50` inside the sidebar, so it could sit under page
  content. It now renders through a **portal to `<body>`** at the same high
  z-index as the task menus (`z-[100]/[101]`) and closes on
  outside-click / Escape / scroll — matching `PopoverMenu`.
  (`components/notifications/notification-bell.tsx`)
- **The colour picker didn't show which colour was selected.** The selected
  swatch now gets a clear **ring halo** (offset ring) instead of a faint 2 px
  border, so the current choice is obvious. (`task-detail-dialog.tsx`)
- **The palette had two near-identical yellows and no red.** Dropped the
  duplicate (`amber`), added **red**, plus **orange** and **indigo** — ten
  visually distinct colours. (`lib/tasks.ts`)

### Changed

- **Per-employee colour is now the note's background, not a dot.** Each employee
  still gets a colour that's **unique within their department**, but instead of a
  small dot beside their name, the whole sticky note takes on that colour when a
  task of theirs has no custom colour — so whose-note-is-whose reads at a glance
  on the Team and Manage boards. Priority: manual colour → assignee's default →
  department colour. The employee's default is drawn from the same `NOTE_COLORS`
  palette as the manual picker. (`task-card.tsx`, `task-list.tsx`, `task-board.tsx`)

### Migration

- `0019_employee_note_colors.sql` — adds `profiles.note_color` and backfills a
  department-unique key per employee. (`profiles.color` from 0018 is retired from
  the UI but left in place; new employees are assigned a `note_color` by the
  invite action.)

## [0.10.0] — 2026-07-04

Dropdown overlay fix, HR & Management as a role, and sticky-note colours + rich
text.

### Fixed

- **Sticky-note dropdown bled through / clicked into the card behind it.** The
  cards are tilted with `transform: rotate()`, which creates a stacking context
  that trapped the assignee menu's `z-index` — so it painted under the cards
  below and clicks landed on them. Dropdowns now render through a **portal to
  `<body>`** (`components/popover-menu.tsx`) with a full-viewport backdrop, so
  they sit above everything, close on outside-click / Escape / scroll, and never
  merge with content beneath them.

### Added

- **HR & Management is now an assignable account role** (alongside admin, team
  lead, employee), grantable from Employee Management regardless of department.
  Authority is granted by the role **or** the existing department membership —
  every current department-based check keeps working. (`is_hr_management()` now
  checks both.)
- **Rich-text task descriptions** — a small formatting toolbar (bold, italic,
  underline, strikethrough, bullet + numbered lists) on the description, stored
  as a strictly-sanitised HTML subset (allowlist, no attributes) and rendered
  safely everywhere the task appears.
- **Sticky-note colour picker** — the creator/assigner can set a note's
  background colour; it persists and shows the same to **everyone** (My Board,
  Team, Manage), overriding the department default.
- **Per-employee default colours** — every employee gets an accent colour that
  is **unique within their department**, shown as a dot / left-border beside
  their name in the Team and Manage views so you can tell whose task is whose at
  a glance. Used for a task's accent when no custom colour is chosen. Multi-
  department people use their primary department's palette.
- **"Completed Tasks" button** on each EOD report — next to "View activity", a
  clean scannable list of just the titles completed that day.

### Migrations (run in order)

- `0017_hr_management_role.sql` — the `hr_management` enum value (run on its own).
- `0018_task_colors_and_hr_role.sql` — `is_hr_management()` honours the role;
  `tasks.color`; `profiles.color` + a department-unique backfill.

## [0.9.1] — 2026-07-04

More trial fixes: correct counts, team-lead assignment, report privacy, and
"done" task stability.

### Fixed

- **Team leads couldn't assign tasks.** The board only let *managers* (or an
  unassigned task) change the assignee, so a team lead's picker was locked the
  moment a task was self-assigned. Team leads can now assign/reassign within
  their department (the board respects a new "can assign others" capability).
- **Counts double-counted.** EOD/report counts were summed from the append-only
  activity log, so moving a task in and out of a column added to the totals each
  time. Counts now come from the **current state of the tasks table** — each
  task counts once. Move a task back out of Done and *completed* drops by one
  while *in progress* rises by one.
- **Employees could see the whole team's reports.** EOD, activity, and task
  history are now **own-only for employees**; team leads see their department;
  admins + HR see everyone (RLS-enforced). The EOD page hides the team sections
  for regular employees.

### Changed

- **Completed tasks are stable.** A task's assignee is **locked once it's Done**
  (can't be reassigned), and no further activity is recorded. Moving a task back
  out of Done **removes its completion from history** (un-completes it), so the
  counts and the timeline stay honest.

### Migration

- `0016_counts_visibility_and_done_lock.sql` — rewrites `eod_summary` /
  `eod_overview` to count current task state, tightens the EOD / activity /
  task-history read policies to be role-scoped, and updates the task triggers
  for the done-lock + un-complete behaviour.

## [0.9.0] — 2026-07-03

Trial-feedback fixes for the Influencer team: task permissions, role-scoped
visibility, deadline notifications, a team-lead invoice view, and mandatory
payment proof on clearing.

### Fixed

- **Task assignment for team leads was blocked.** The old "assign once, only
  managers reassign" rule stopped team leads (and made the assignee dropdown
  useless). Now:
  - **Team leads** create + assign tasks to anyone **in their department(s)**.
  - **Admins + HR** assign to anyone.
  - **Regular employees** can only create tasks **for themselves** — they can't
    assign to others.
- **Team view leaked everyone's tasks to everyone.** Visibility is now
  role-scoped **and enforced by RLS** (not just the UI):
  - employee → **only their own** tasks;
  - team lead → **their department(s)** only;
  - admin / HR → all departments.

### Added

- **Deadline notifications** (via the existing 18:00 IST cron): a task due
  **tomorrow** reminds its assignee; an **overdue** task notifies the assignee
  **and their department's team lead(s)**. New `task_due_soon` / `task_overdue`
  types.
- **Department invoices** (`/billing/department`) — a read-only view for **team
  leads** (and admins/HR) of every invoice posted by their department: employee
  name, amount, status, date, with **search** (employee / amount / details) and
  **sort** (date / amount / status / employee), and a link to each payment proof.
- **Mandatory payment proof on clearing.** Clearing an invoice now **requires**
  attaching a proof file (image/PDF) — the Clear button opens a file picker and
  refuses without one ("Payment proof is required to clear an invoice"). The
  proof is stored in the private `payment-proofs` bucket; the poster, team lead,
  and managers can open it via a **View payment proof** link on the invoice.

### Migration

- `0015_task_visibility_and_assignment.sql` — the new task SELECT/INSERT/UPDATE
  policies, the `can_assign_to()` helper, and the updated rules trigger.
  (`payment_proof_path` and the `payment-proofs` bucket already existed from
  migration 0002 — no change needed there.)

## [0.8.0] — 2026-07-03

Employee profiles + avatars, the department-scoped **team_lead** role, and EOD
notification/attendance fixes.

### Added

- **Employee profiles** (`/profile`). Every employee has a profile page showing
  their name, email, post, role, department(s), and join date, and can **upload
  a profile picture** (stored in a new public `avatars` bucket). The
  **Change-password** control moved here from the sidebar. Avatars now appear in
  the sidebar and the Employee Management list (task-card / chat-message avatars
  are wired in the data layer and will surface next).
- **Team Lead role** — a department-scoped middle tier. Team leads can assign
  tasks to their department's members and open the **Reporting** module scoped
  to their own department(s) only (team overview, EOD reports, per-employee
  reviews). They cannot manage staff, clear invoices, see other departments'
  data, or touch admin settings. Admins assign the role from Employee Management
  (a per-row role selector) or when adding an employee.
- **Incomplete attendance.** If someone was active but never submitted their EOD
  by end of day, their attendance is flagged **Incomplete** (shown in the team
  overview and employee review).

### Fixed / Changed

- **EOD-submitted notifications now fire reliably.** They were raised from a
  Server Action via the service-role client; if that key wasn't present at
  runtime the insert silently failed. Moved into a **database trigger** on
  `eod_reports` insert, so admins + HR are notified independently of any env var.
- **EOD reminder reworked.** The reminder now runs at **17:30 IST** ("submit
  within 30 minutes or your attendance won't be counted"); a new **18:00 IST**
  finalize cron marks incomplete attendance and archives stale done tasks.

### Migrations (run in order)

- `0013_avatars_and_team_lead_role.sql` — `avatars` bucket + RLS, `avatar_path`,
  and the `team_lead` enum value.
- `0014_team_lead_and_eod.sql` — `is_team_lead()`, the EOD-submitted trigger,
  `activity_logs.incomplete`, and `finalize_incomplete_attendance()`.

## [0.7.3] — 2026-06-30

### Added

- **Midnight theme.** A third theme alongside Light and Dark — near-black
  surfaces with a vivid green accent, tuned for high contrast (the standard Dark
  theme is green-on-green and can read flat). The sidebar's theme control is now
  a Light / Dark / Midnight picker; the choice persists and applies pre-paint
  (no flash). Frontend-only — no migration.

## [0.7.2] — 2026-06-30

### Added

- **Employee "post" (designation).** The Add-employee form now has an optional
  **Post** field (e.g. "Video Editor"), stored on the profile and shown in the
  employee roster and on the employee review page. Migration
  `0012_profile_post.sql` adds `profiles.post` and updates the auto-provision
  trigger to copy it from the invite.

## [0.7.1] — 2026-06-30

### Changed

- **Invoice numbers are assigned at posting, not generation.** The generator no
  longer invents a number (that spent a number on every PDF, including ones never
  filed) — its invoice-number field is now optional. The **official, sequential
  number is assigned by the database when an invoice is posted** (`HD-00001`,
  `HD-00002`, …), so numbers are only used for invoices that are actually
  tracked. Migration `0011_auto_invoice_number.sql` adds the sequence + a column
  default; the posting form no longer asks for a number.

## [0.7.0] — 2026-06-30

A major expansion of Tasks & Reporting: passive activity tracking, a manager
**Reporting** module, an EOD report viewer, and a task-history/timestamp rework.

### Added

- **Passive activity logging ("attendance").** Every time an employee uses the
  portal, the app stamps their activity — no clock-in, nothing they do. One row
  per person per day (`activity_logs`): first_seen ("arrived"), last_seen,
  distinct pages visited, an action count, and eod_submitted_at ("left").
  Recording runs *after* the response via `after()`, so it adds no latency, and
  is keyed to the session so nobody can forge someone else's attendance.
  Submitting an EOD is treated as "clocking out".
- **Reporting module** (`/reporting`, admins + HR & Management), added to the
  sidebar and dashboard:
  - **Team Overview** — today's activity: who's online now (active in the last
    15 min), who's submitted their EOD, who hasn't been seen, and tasks completed
    today, filterable by department.
  - **EOD Reports** — the full submitted-report history, filterable by employee /
    department / date range; each report opens to the manual note plus that day's
    task timeline with exact timestamps.
  - **Employee Reviews** — a per-person drill-down: their activity log
    (arrive / leave / active-for per day, with a "No EOD" flag), full task
    history, EOD history, and stats (avg arrival, avg completed/day, EOD
    submission rate, most active hours). Reachable from a "View report" button on
    Employee Management.
- **Task lifecycle timestamps.** Tasks now record `started_at` (first move to In
  Progress) alongside `completed_at`; cards show them and compute "time in
  progress", and the task detail dialog shows created/started/completed plus the
  full status-change history.
- **EOD-submitted notification.** The first time someone submits their EOD,
  admins + HR are notified (with a link to that person's review).

### Changed

- **Task history survives deletion.** `task_activity` no longer cascades away
  when a task is deleted (FK is now `ON DELETE SET NULL`) and denormalises the
  task title + department onto each row. So a task that was *completed and then
  deleted* stays in that day's EOD/history (it was real work), while live board
  counts — which read the tasks table — correctly exclude deleted tasks.
- **Auto-archive.** "Done" tasks older than 7 days move off the board
  (archived = true) but stay in history — run daily by the existing cron.
- `task_activity` is exposed as a `task_activity_log` view (spec-named columns).

### Migrations (run in order)

- `0009_activity_logs.sql` — the `activity_logs` table, its RLS + indexes, the
  `record_activity()` writer, and the eod_reports "clock-out" trigger.
- `0010_task_history_and_timestamps.sql` — `tasks.started_at`; makes
  `task_activity` durable + denormalised; updates the task triggers; the
  `task_activity_log` view; and `archive_stale_done_tasks()`.

## [0.6.3] — 2026-06-30

Performance pass across the whole portal — no functional changes, only speed.

### Fixed

- **Duplicate auth checks on every navigation.** The shared dashboard layout
  resolves the signed-in user's access (`getUserAccess()`), and nearly every
  page ALSO called its own guard (`requireProfile()`, `requireBillingManager()`,
  etc.) — each one independently re-running `auth.getUser()` (a real network
  call to Supabase Auth) plus the `profiles` lookup. That's why the delay was
  felt specifically *between clicking a link and the next page appearing*: the
  same session check was running two or three times before the page could even
  start its own data queries. Fixed by wrapping the auth helpers in
  (`lib/auth.ts`) so the underlying calls run at most once per navigation, no
  matter how many places call them — a straightforward request-scoped memoization,
  not a cache with any staleness risk (every navigation still gets a fresh check).
- **One Storage API call per file → one batched call.** Generating "view PDF"
  links for posted invoices was firing one `createSignedUrl()` request per
  attached file, in parallel. `/billing/clearing` and `/billing/post` now use
  Storage's batched `createSignedUrls()` — one network round trip for every
  file on the page instead of one per file.

### Changed

- **Trimmed over-fetching.** Several list queries used `select("*")` and pulled
  back columns nothing renders — most notably `invoices.document`, a jsonb blob
  left over from an earlier design that posting no longer writes. Billing
  (post/clearing/analytics), Tasks (board/team/manage), Employee Management, and
  Petty Cash now select only the columns their pages actually use.
- **Added indexes for query patterns that weren't covered.** Migration `0008`
  adds four indexes tied to specific queries: `task_activity(action, to_status,
  created_at)` for the Manage dashboard's weekly-completions count,
  `eod_reports(report_date desc, created_at desc)` for the site-wide recent-
  reports list and the EOD-reminder cron, and `created_at` indexes on
  `misc_payments` and `invoices` for their date-ordered lists.

### Added

- **Lightweight performance monitoring.** `lib/perf.ts` wraps a page's data
  loading in a `time()` call that logs duration — visible in Vercel's Runtime
  Logs, searchable by route, no new infrastructure. Anything slower than 400ms
  logs as a warning so it's easy to spot. Wired into every page that talks to
  the database. `@vercel/speed-insights` is also now in the root layout for
  real Core Web Vitals per page (needs "Speed Insights" turned on once in the
  Vercel project settings).

## [0.6.2] — 2026-06-30

### Added

- **Petty Cash** (`/billing/petty-cash`) — a simple ledger for one-off cash
  payments, admins + HR & Management only (same gate as Clear/Analytics). No
  provider, no PDF, no approval chain: a three-field quick entry (amount in ₹,
  paid to, reason), KPIs (today / last 7 days / this month / all-time), a
  6-month trend, and a searchable/sortable history with delete for corrections.
  Built on `public.misc_payments`, which already existed (migration 0002) with
  RLS scoped to billing managers — no new migration needed, just the UI and a
  server action (`createPettyCashEntry`, `deletePettyCashEntry`).

## [0.6.1] — 2026-06-30

### Added

- **Daily EOD reminder.** A Vercel Cron job (`vercel.json`, 17:55 IST) hits
  `/api/cron/eod-reminder`, which notifies every active employee who hasn't yet
  submitted today's EOD report — via the existing notification bell/toasts, new
  `eod_reminder` type, linking to `/tasks/reports`. Runs server-side on a
  schedule, independent of anyone being signed in. Protected by a `CRON_SECRET`
  the route checks against Vercel's automatic `Authorization: Bearer` header;
  a 20-hour "already reminded" guard prevents duplicate pings from a retried
  invocation.

### Setup note

- Add a `CRON_SECRET` environment variable in Vercel (any long random string —
  e.g. `openssl rand -hex 32`) matching the one in your local `.env.local`.
  Vercel Cron sends it automatically once the env var exists; no other config
  needed. **Note:** exact-minute cron timing is a Vercel **Pro** plan feature —
  on Hobby, daily Cron Jobs may fire anytime within the scheduled hour.

### Fixed

- **Notifications stayed unread after a refresh.** Marking a notification read
  built the database update but never executed it (`void`-ing a lazy Supabase
  query builder never sends the request) — state cleared locally, then reverted
  on reload. Fixed for the bell, chat's per-conversation read cursor, and
  "mark all read".

## [0.6.0] — 2026-06-30

The **Tasks & Reporting** module (Phase 5) — a personal kanban that doubles as
the company's end-of-day reporting system.

### Added

- **My Board** (`/tasks`) — a personal kanban (To Do / In Progress / Done) of
  sticky-note cards. Quick-add (type a title, press Enter), drag-and-drop or ◀ ▶
  to move, assign to yourself or a department colleague, set a deadline
  (countdown / *overdue* in red), and edit / archive / delete. Cards are
  colour-coded by department, gently tilted, and lift on hover. Assigning a task
  to someone else notifies them through the existing notification system.
- **Team** (`/tasks/team`) — a read-only view of every task across the user's
  department(s), filterable by member, with a *to do / in progress / completed
  today* summary. You see everyone's tasks but edit only your own.
- **Manage** (`/tasks/manage`, admins + HR & Management) — an all-departments
  dashboard: completion stats (today / this week), a "no activity today" flag, a
  7-day leaderboard, and a task view filterable by department, person, status,
  and date range.
- **EOD Reports** (`/tasks/reports`) — auto-generated from each person's task
  activity: created / started / completed / pending counts, an optional note to
  finalise, a team-wide "today" table with idle people flagged, and recent
  submitted reports. Visibility = own / department / all (managers).
- Migration `0006_tasks_and_reporting.sql` — `tasks`, an append-only
  `task_activity` log, and `eod_reports`; triggers that maintain
  `updated_at`/`completed_at` and write the activity log automatically; and
  `SECURITY DEFINER` helpers (`can_view_task`, `eod_summary`, `eod_overview`)
  with RLS throughout. Day boundaries use **Asia/Kolkata (IST)**.
- Sidebar entry and dashboard tool card for the module; `task_assigned`
  notification type.

### Notes

- **Reporting reads the activity log, not a nightly job** — any day's report is
  correct on demand; "submitting" stores the note plus a snapshot. This keeps the
  feature migration-light and avoids a scheduler.
- The Team and Manage views are read-only **list** views by design; the
  interactive kanban is the personal board.
- Other people's tasks are read-only because the `tasks` UPDATE policy only
  admits the creator, the assignee, or a manager — the same rule the UI shows.

## [0.5.1] — 2026-06-30

### Added

- **Password reset / change via email.** Employees can now set their own password
  — there was previously no way to (accounts are admin-provisioned). Built on
  Supabase Auth's recovery flow:
  - **Request** (`/forgot-password`, public) — enter your email and a reset link
    is sent. The response is deliberately the same whether or not the address has
    an account (no email enumeration).
  - **Confirm** (`/auth/confirm`) — a route handler that verifies the recovery
    link and establishes a session. It accepts both link shapes Supabase may
    send (`token_hash` + `type` via `verifyOtp`, or `code` via
    `exchangeCodeForSession`), then forwards to the new-password page.
  - **Set new password** (`/reset-password`) — reachable only with the session
    the link establishes; sets the new password (`updateUser`) and signs you in.
  - Entry points: a **"Forgot password?"** link on the sign-in screen and a
    **"Change password"** link in the sidebar (which pre-fills your email).
- `/forgot-password` added to the middleware's public routes; `/reset-password`
  stays protected (only the recovery session can reach it).

### Setup note

- **No email-template editing needed.** The reset action passes a `redirectTo`
  of `<origin>/auth/confirm?next=/reset-password`, which the default recovery
  email respects. The only required config is to allow that URL: in **Supabase →
  Authentication → URL Configuration → Redirect URLs**, add `http://localhost:3000/**`
  and `https://<your-domain>/**`, and set **Site URL** to the deployed domain.
- `/auth/confirm` also accepts the `token_hash` shape, so editing the template to
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password`
  remains a valid (cross-device-safe) alternative if preferred.
- For real volume, configure custom SMTP — Supabase's built-in sender is
  rate-limited.

## [0.5.0] — 2026-06-30

The **Chat module** (Phase 4) and a portal-wide **notification system**.

### Added

- **Real-time chat** (`/chat`) — direct messages and named groups, built on
  Supabase Realtime. A single message-insert subscription (scoped by RLS to the
  user's own conversations) powers the open thread, unread badges, conversation
  re-ordering, and even surfaces a brand-new DM or group the moment its first
  message lands. Messages support **@mentions** with an inline people picker.
  - **Groups** — create a group, rename it, add/remove members, and leave.
    Group admins (the creator) manage the roster; anyone can leave.
  - Migration `0005_chat_and_notifications.sql` — `conversations`,
    `conversation_participants`, `messages`, `notifications`; `SECURITY DEFINER`
    membership helpers (avoiding RLS recursion), a read-cursor setter, an unread
    tally, and a trigger that keeps each conversation's "last message" current.
- **Notifications + pop-ups.** A bell (with an unread badge and a recent-items
  dropdown) lives in the sidebar; new items also arrive as auto-dismissing
  toasts — both fed by one realtime subscription owned by a
  `NotificationsProvider` that wraps the whole shell. Clicking a notification
  marks it read and jumps to its target (a chat thread, the clearing queue).
  - **DMs always ping the recipient; group messages ping only @mentioned
    members** (group chatter shows as unread counts instead of notifying
    everyone). A toast is suppressed for a conversation you're already viewing.
- **Management is notified when an invoice is posted.** Posting an invoice now
  raises an `invoice_posted` notification to every admin + HR & Management member,
  linking straight to the clearing queue.

### Changed

- **`profiles` reads opened to all signed-in users.** Chat needs a directory so
  the team can address each other; SELECT on `profiles` is now allowed for any
  authenticated user. Writes (insert/update/delete) stay restricted to admins +
  HR & Management.

### Notes

- **No file uploads in chat (yet).** Files are shared by pasting links (e.g.
  Google Drive) into a message. The swappable storage layer is still in place for
  when attachments are added; nothing about this phase commits to a provider.
- **Notifications are written server-side only.** The `notifications` table has
  no INSERT policy — the browser can never fabricate one for another user. They
  are created exclusively by the service-role client inside authenticated Server
  Actions (`lib/notifications.ts`).

## [0.4.0] — 2026-06-27

### Changed

- **User Management → Employee Management.** Route renamed `/users` →
  `/employees`. Reworked roster: avatars, role + department badges, a "You"
  marker, and a live client-side search (name / email / department).

### Added

- **Remove an employee (soft).** A guarded Server Action **deactivates** rather
  than deletes — it sets `profiles.deactivated_at` and bans the auth login,
  keeping the person's history (the invoices they raised) intact, and is
  restorable from a separate "Removed" section. `lib/auth.ts` treats a non-null
  `deactivated_at` as no-access; the auth ban cuts off any live session.
  Migration `0004_employee_deactivation.sql`.
  - Guards: you can't remove yourself, and only an admin can remove another
    admin — enforced server-side.

### Notes

- Hard delete isn't an option: `invoices.created_by` / `misc_payments.created_by`
  are `ON DELETE RESTRICT`, and a cleared invoice must retain who raised it.
  Deactivation revokes access without breaking that audit trail.

## [0.3.1] — 2026-06-27

### Added

- **Spend analytics** (`/billing/analytics`, admins + HR & Management) — KPIs
  (cleared / pending / cleared-this-month / rejected), a 12-month cleared-spend
  trend, and breakdowns by department and category. Aggregated in the server
  component over the `invoices` table; charts are dependency-free CSS bars.

### Notes

- "Spend" = cleared invoices; pending is surfaced alongside for forecasting.
  Totals sum in the base currency (INR). In-process aggregation suits the
  current volume and lifts into a SQL `SECURITY DEFINER` function if it grows.

## [0.3.0] — 2026-06-27

The **billing module** — the portal's first real feature beyond the shell. Built
as three separate tools that mirror how an invoice actually moves through the
company: **generate → (sign offline) → post → clear**.

### Added

- **Invoice generator** (`/billing/generate`) — a standalone tool. Fill in a
  service provider's details and line items, and download a branded PDF that is
  rendered **entirely in the browser** (jsPDF). No server round-trip, nothing
  stored — it only creates PDFs.
  - **Eight distinct templates** (`lib/invoice-templates.ts`) — different
    layouts, colours, fonts, and table structures.
  - **Bill-to fixed to Herbal Deck** (`lib/company.ts`); invoice number and date
    are auto-filled.
  - **Payment-details block** (Account Holder, Account Number, Bank Name, IFSC,
    Swift, PAN) so the provider can be paid.
  - **Live preview is the actual PDF**, shown in an iframe, so every template
    renders exactly as it will download.
- **Post invoices** (`/billing/post`) — any employee records an invoice into
  tracking: provider, amount, department (validated against their memberships),
  category, reason, and an optional PDF upload. Shows each employee their own
  posted invoices with live status.
- **Clear invoices** (`/billing/clearing`) — **admins and HR & Management only**.
  Clickable **department panels**, **status views** (pending / cleared /
  rejected) with counts, **search**, and **sort**. Managers upload the signed
  copy and **clear** or **reject** — recording who acted and when.
- Billing sub-navigation tabs and a billing route-group layout.
- Migration `0003_invoice_posting.sql` (adds `reason` to `invoices`).

### Changed

- The generator first shipped (earlier the same day) with an integrated "post"
  panel. It was **split** into a standalone generator plus separate **Post** and
  **Clear** sections — cleaner, less cluttered, and with clearer permission
  boundaries (only admins/HR see clearing).

### Context — the problems behind these decisions

- **Identical invoices look mass-produced.** Generating every service-provider
  invoice from one template made them look auto-generated, which is a problem for
  authenticity and potential tax scrutiny. → We ship **eight different
  templates** so a batch of invoices doesn't look like it came off a press.
- **We're B2C/D2C — we don't bill clients.** Employees raise invoices *on behalf
  of service providers* who bill Herbal Deck. → The generator was reframed so the
  provider is the issuer and **Herbal Deck is the fixed bill-to**.
- **The rupee symbol won't print.** jsPDF's built-in fonts can't render `₹`
  (or reliably `€`/`£`). → Money shows the proper symbol on screen but an
  **ASCII prefix in the PDF** (`Rs.`), so amounts never turn into empty boxes.
- **Spend has to be tracked and signed off.** → Posting and clearing are built on
  the existing `invoices` table, which records **who created** and **who
  cleared** each invoice and when; clearing is restricted to admins + HR.

## [0.2.0] — 2026-06-27

The real **organisational model** — departments, multi-department membership, and
a department-based authority tier — plus the database design for billing.

### Added

- **Departments** — the seven Herbal Deck departments, seeded, with a
  many-to-many `profile_departments` table so a person can belong to more than
  one (`supabase/migrations/0002_departments_and_billing.sql`).
- **Department-based authority.** **HR & Management** gains the authority to
  manage staff and billing — not via a job title, but via department membership.
  `SECURITY DEFINER` helpers: `is_hr_management()`, `can_manage_billing()`,
  `can_manage_users()`.
- **User Management v2** — assign employees to department(s) via multi-select,
  edit memberships inline, and show department badges. Access widened from
  admin-only to **admins + HR & Management**.
- `getUserAccess()` / `requireUserManager()` — resolve a user's capabilities
  (admin, HR & Management, can-manage-users/billing) in one place.
- Billing data model — `invoices`, `invoice_categories`, `misc_payments`, with
  RLS — and private storage buckets, ready for the 0.3.0 module.

### Changed

- **`middleware.ts` → `proxy.ts`.** Next.js 16 deprecates the middleware
  convention; the route-protection entry point was renamed accordingly.
- **Theme toggle rewritten** to read the theme via `useSyncExternalStore`,
  removing a set-state-in-effect pattern and a potential hydration mismatch.

### Context — the problems behind these decisions

- **Authority doesn't map to a single job title.** Several people share staff
  and billing authority, and some belong to multiple departments. Modelling
  authority as a *department* (HR & Management) rather than a role, with a
  proper many-to-many membership table, captured that cleanly.
- **Deployments were blocked with "fix git".** Vercel only auto-publishes
  commits whose author it recognises; early commits used a placeholder identity,
  so Vercel **blocked** them. Fixed by setting the git author to the owner's
  verified GitHub email — a security feature, not a bug.

## [0.1.0] — 2026-06-26

Initial platform shell. Establishes the foundation — authentication, roles,
navigation, theming, and placeholder modules — onto which feature logic will be
built in subsequent releases.

### Added

- **Project foundation**
  - Next.js 16 (App Router) + React 19 + TypeScript (strict) scaffold.
  - Tailwind CSS v4 with a CSS-token design system and class-based dark mode.
- **Authentication**
  - Email + password sign-in via Supabase Auth (`@supabase/ssr`, cookie-based
    sessions).
  - Proxy (middleware) that refreshes sessions and protects routes.
  - Server-side guards: `requireProfile()` and `requireAdmin()`.
  - Sign-out route handler.
  - Invite-only model — no public registration.
- **Roles & authorization**
  - `admin` and `employee` roles stored in a `profiles` table.
  - PostgreSQL **Row Level Security** policies and a `SECURITY DEFINER`
    `is_admin()` helper (`supabase/schema.sql`).
  - Database trigger that auto-provisions a profile and role on user creation.
- **Dashboard**
  - Clean, data-driven tool-card grid; built to scale to many modules.
  - "Billing & Invoices" tool card (placeholder).
- **Navigation & layout**
  - Responsive sidebar with Herbal Deck branding, role-filtered links
    (Dashboard, Billing, Chat, and admin-only User Management), signed-in user
    summary, and logout.
  - Single-source-of-truth navigation config (`lib/navigation.tsx`).
- **Modules (placeholders)**
  - Billing & Invoices — route and UI shell, no business logic.
  - Chat — UI layout only; real-time messaging to follow via Supabase Realtime.
- **User Management (admin only)**
  - Add employees via an admin-guarded Server Action using the server-only
    service-role key.
  - Team list with role badges.
- **Theming**
  - Light (default) and dark modes in the brand palette — forest green primary,
    mint surfaces, charcoal text; deep-green dark mode — with a persisted toggle
    and no flash-of-wrong-theme on load.
  - Inter typeface.
- **Documentation**
  - `docs/README.md`, `docs/architecture.md`, `docs/decisions.md`, and this
    changelog.

### Notes

- No billing logic is included in this release by design; 0.1.0 is the platform
  shell only.
- Problem identification, architecture, and technical decisions owned and
  directed by the project owner.
