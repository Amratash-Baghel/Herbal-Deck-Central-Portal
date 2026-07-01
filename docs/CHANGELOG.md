# Changelog

All notable changes to the Herbal Deck Portal are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
