# Architecture Decision Record

This document captures the key technical decisions made for the Herbal Deck
Portal and the reasoning behind each. It is written so that a future engineer
(or employer) can understand not just *what* was chosen, but *why*.

---

## 1. Framework — Next.js (App Router)

**Decision:** Build on Next.js 16 using the App Router and React Server
Components.

**Why:**

- **Full-stack in one codebase.** Server Components, Server Actions, and Route
  Handlers let us write data access and mutations next to the UI without a
  separate API tier — appropriate for an internal tool maintained by a small
  team.
- **Server-side auth that's secure by default.** Session checks and role gates
  run on the server before any protected markup is sent, rather than relying on
  client-side redirects that can flash protected content.
- **A natural module boundary.** File-system routing maps cleanly onto our
  "shell + modules" model: each module is a folder, and a shared route-group
  layout provides auth and chrome.
- **First-class Vercel deployment.** Zero-config builds and preview deployments
  (see decision 3).

**Alternatives considered:** A separate SPA (e.g. Vite + React) with a
standalone API. Rejected as more moving parts and more bespoke auth wiring than
an internal tool warrants.

## 2. Backend & database — Supabase

**Decision:** Use Supabase (managed PostgreSQL) for the database, authentication,
and authorization.

**Why:**

- **Auth, database, and authorization in one platform.** Supabase Auth handles
  credentials and sessions; PostgreSQL stores the data; **Row Level Security**
  ties access rules directly to the data. We avoid stitching together a
  separate auth provider and database.
- **Real PostgreSQL.** Standard SQL, constraints, triggers, and enums — durable,
  portable skills and no proprietary query language. The schema lives in
  version control (`supabase/schema.sql`).
- **A clear path for future modules.** The planned Chat module uses Supabase
  Realtime; file features can use Supabase Storage — all under the same auth and
  RLS model.
- **SSR-safe sessions.** The official `@supabase/ssr` package integrates cookie
  based sessions with Next.js middleware and Server Components.

**Alternatives considered:** Firebase (NoSQL data model and vendor-specific
security rules, less aligned with relational data and SQL); a hand-rolled
Node/Postgres backend (more infrastructure and security surface to own).

## 3. Hosting & CI/CD — Vercel

**Decision:** Deploy to Vercel with Git-driven deployments.

**Why:**

- **Built for Next.js.** Vercel is the framework's first-party platform; builds,
  routing, the Edge proxy, and serverless functions work without custom config.
- **Deployment as a Git push.** Merging to the production branch deploys;
  opening a pull request yields an isolated preview URL for review.
- **Operational simplicity.** Managed scaling, TLS, and a global edge network
  with no servers to maintain — the right trade-off for a small team.

**Alternatives considered:** Self-hosting (Docker/VM) — more control, but
infrastructure overhead and security patching we don't need for an internal
portal.

## 4. Invite-only authentication (no public sign-up)

**Decision:** Disable self-registration entirely. Only administrators create
accounts, from inside the portal.

**Why:**

- **It's an internal tool.** Access should be restricted to vetted employees;
  open registration has no place in that model.
- **Controlled onboarding.** Admins assign the correct role at creation time and
  retain a clear record of who has access.
- **Reduced attack surface.** No public registration endpoint to abuse, no
  unverified accounts, no email-enumeration or sign-up spam to defend against.

**Implementation:** Account creation runs in an admin-guarded Server Action
using Supabase's service-role key **on the server only**. A database trigger
provisions the user's `profiles` row and role. The first admin is bootstrapped
manually (documented in `supabase/schema.sql`).

## 5. Row Level Security (RLS) for authorization

**Decision:** Enforce data access with PostgreSQL Row Level Security, not just
in the application layer.

**Why:**

- **Defense in depth.** The UI hides what a user shouldn't see, but the database
  is the authority on what they can *access*. Even if a bug bypassed a UI check,
  RLS refuses the underlying query.
- **Authorization lives with the data.** Policies are defined per table next to
  the schema, so every client — current or future — is subject to the same
  rules automatically.
- **Least privilege by default.** The browser uses the anon key, which can only
  ever read or write what the policies permit for the signed-in user. The
  powerful service-role key is confined to specific, audited server actions.

**Implementation:** `profiles` has RLS enabled with policies allowing a user to
read their own row and admins to manage all rows. To avoid the classic
recursion of a profiles policy querying profiles, role checks go through a
`SECURITY DEFINER` `is_admin()` function. Full policy definitions are in
`supabase/schema.sql`.

## 6. Authority through departments, not job titles

**Decision:** Model operational authority as membership of the **HR &
Management** department, and let people belong to **multiple** departments
(a many-to-many `profile_departments` table), rather than a single role/title.

**Why:**

- **It matches reality.** Authority over staff and billing is shared by several
  people, and some employees sit in more than one department. A single
  `role` column or one-department-per-person foreign key couldn't express that.
- **Two clean tiers above "member."** `admin` stays owner-level (founder, CTO);
  everything else flows from department membership. `can_manage_users()` and
  `can_manage_billing()` both resolve to *admin OR HR & Management*, so widening
  who has authority is a membership change, not a code change.
- **One capability resolver.** `getUserAccess()` computes a user's
  capabilities once; pages and actions consume the result instead of
  re-deriving permissions ad hoc.

**Implementation:** `SECURITY DEFINER` helpers (`is_hr_management()`,
`can_manage_billing()`, `can_manage_users()`) back the RLS policies, mirrored in
the app by `getUserAccess()` / `requireUserManager()` / `requireBillingManager()`.
See `supabase/migrations/0002_departments_and_billing.sql`.

## 7. Invoices generated client-side as PDFs

**Decision:** Render invoice PDFs **in the browser** with jsPDF + jsPDF-AutoTable
(dynamically imported), rather than on the server or via a third-party service.

**Why:**

- **Instant and dependency-light.** "Download" needs no network round-trip, no
  server CPU, and no external API key or quota. The libraries are
  framework-agnostic, so they sidestep React-version peer-dependency friction.
- **The preview is the real thing.** The live preview is the actual rendered PDF
  shown in an iframe — so all eight templates display exactly as they download,
  with no separate HTML preview to keep in sync.

**The catch we hit:** jsPDF's built-in fonts can't render the rupee glyph `₹`
(and are unreliable for `€`/`£`). **Resolution:** a single money formatter with
two modes — Unicode symbols on screen, **ASCII prefixes** (e.g. `Rs.`) in the
PDF — so amounts never become empty boxes (`lib/money.ts`).

## 8. Eight invoice templates (so invoices don't look mass-produced)

**Decision:** Ship **eight visually and structurally distinct** invoice
templates rather than one house style.

**Why:**

- **Identical invoices look auto-generated.** These invoices are raised on behalf
  of many different service providers. If every one came out of a single
  template, a stack of them would obviously look machine-made — a problem for
  authenticity and a realistic concern under **tax scrutiny**, where invoices are
  expected to originate from independent providers.
- **Variety is the feature.** The templates differ in layout, colour,
  typography, and table structure (e.g. with/without quantity columns), so a
  batch reads as genuinely separate documents.

**Implementation:** Each template is a `draw(ctx)` function over a shared,
jsPDF-free context (`lib/invoice-types.ts` → `lib/invoice-templates.ts`); the
builder dispatches to the selected one (`lib/invoice-pdf.ts`).

## 9. Three separate billing tools (generate · post · clear)

**Decision:** Split billing into a **standalone generator**, a **Post** section,
and a **Clear** section — instead of one combined screen. The generator only
creates PDFs; it has no posting link.

**Why:**

- **They're different jobs for different people.** Generating a document, filing
  it for tracking, and approving it for payment are separate steps in the real
  workflow (generate → owner signs offline → post the signed copy → management
  clears). Separate tools keep each screen focused and uncluttered.
- **Clear permission boundaries.** Clearing is the sensitive step, so it lives in
  its own section restricted to **admins + HR & Management** — enforced in the
  page guard *and* by RLS. Anyone can generate or post; only managers can clear.

> An earlier build merged generation and posting into one screen. It was split
> once the real workflow above became clear — simpler, and easier to lock down.

## 10. Expense tracking built on a single invoices table

**Decision:** Track posted invoices and their approval on the existing
`invoices` table, recording **who created** and **who cleared** each one, rather
than a separate audit log.

**Why:**

- **A built-in paper trail.** `created_by`, `cleared_by`, `cleared_at`, and a
  three-state `status` (pending / cleared / rejected) make the table itself the
  record of what happened, queryable for the clearing dashboard's department
  panels, status views, search, and sort.
- **Files stay out of the database.** Uploaded copies live in a private storage
  bucket; the row holds only a path. The clearing UI serves them through
  short-lived signed URLs generated server-side.

## 11. Analytics aggregated in-process, charts without a library

**Decision:** Compute the spend breakdowns in the **server component** (group by
department, category, and month in memory) rather than a SQL view/RPC, and render
**CSS bar charts** rather than adding a charting library.

**Why:**

- **Right-sized.** At this volume, fetching the `invoices` rows the manager can
  already see and reducing them server-side is simpler than a database function
  and needs no extra migration. The aggregation is isolated, so it lifts into a
  `SECURITY DEFINER` SQL function later if the table grows.
- **No dependency for a few bars.** Width-/height-proportional `div`s render
  server-side, carry no client JS, and avoid a charting library's bundle weight
  and React-version peer constraints — consistent with the client-side PDF
  reasoning (decision 7).

**Semantics:** "Spend" counts **cleared** invoices; pending is shown separately
for forecasting. Totals sum in the base currency (INR).

## 12. Removing an employee = deactivation, not deletion

**Decision:** "Removing" an employee soft-deactivates them (`deactivated_at` +
an auth ban), rather than hard-deleting the account.

**Why:**

- **The audit trail must survive.** `invoices.created_by` and
  `misc_payments.created_by` are `ON DELETE RESTRICT`, so the database refuses to
  delete anyone whose name is on a posted invoice — correctly, since a cleared
  invoice has to keep who raised it. A hard delete would either fail or destroy
  financial history.
- **Reversible and safe.** Deactivation revokes access immediately (the app
  treats `deactivated_at` as no-access; the auth ban cuts live sessions) but
  keeps the record, so an accidental removal is a one-click restore.

**Guards:** you can't deactivate yourself, and only an admin can deactivate
another admin — checked in the Server Action, not just the UI.

## 13. Chat realtime — one RLS-scoped subscription, no per-message fan-out

**Decision:** Drive the whole chat UI from a **single** Supabase Realtime
subscription to *message inserts* with no client-side filter, letting **RLS**
decide which rows each client receives. Membership checks
(`is_conversation_participant`, `is_conversation_admin`) are `SECURITY DEFINER`
functions.

**Why:**

- **One stream does everything.** Because RLS only delivers messages from
  conversations the user belongs to, that single subscription powers the open
  thread, unread badges, conversation re-ordering, and even surfaces a brand-new
  DM or group the instant its first message arrives — no separate channel per
  conversation, and no extra subscription just to learn about new chats.
- **No policy recursion.** A policy on `conversation_participants` that queried
  that same table would recurse; the `SECURITY DEFINER` helpers read membership
  without re-triggering RLS — the same pattern as `is_admin()` (decision 5).
- **Right-sized for the team.** At ~40 people, Postgres Changes is more than
  enough; the broadcast escape hatch exists if traffic ever outgrows it.

**File sharing, deliberately deferred.** Chat does not upload files yet — they're
shared by pasting a link (e.g. Google Drive) into a message. This avoids paying
for and managing attachment storage on day one; the existing swappable storage
layer is ready when uploads are worth adding.

## 14. Notifications — written server-side only; DMs ping, group chatter doesn't

**Decision:** A portal-wide notification system (a bell + pop-up toasts) fed by
one realtime subscription, where rows are **only ever created server-side**, and
**direct messages notify the recipient while group messages notify only the
people @mentioned**.

**Why:**

- **The browser can't fabricate a notification.** The `notifications` table has
  **no INSERT policy**, so a user can never create one for someone else. They are
  produced exclusively by the service-role client inside authenticated Server
  Actions (`lib/notifications.ts`) — the same trusted-elevation pattern as admin
  user provisioning (decision 4).
- **Notify, don't spam.** Pinging all forty members on every line of a busy group
  would train people to ignore the bell. So a DM always pings its recipient, and
  in a group only an explicit **@mention** pings — ordinary group traffic shows
  up as unread counts instead. A toast is also suppressed for a conversation the
  user is already viewing.
- **Operational glue.** The same mechanism closes a real gap: posting an invoice
  now notifies everyone who can clear it (admins + HR & Management), linking
  straight to the clearing queue, so approvals don't sit unnoticed.

**Implementation:** A `NotificationsProvider` wrapping the authenticated shell
owns the single subscription and shares state with the sidebar bell and the
toaster. See `supabase/migrations/0005_chat_and_notifications.sql`.

## 15. Request-scoped memoization for auth, not a data cache

**Decision:** Wrap `lib/auth.ts`'s helpers in React's `cache()` so the
underlying `auth.getUser()` + `profiles` query runs at most once per
navigation, however many places call them — rather than adding a time-based
cache (a few seconds' TTL, `unstable_cache`, etc.) for the same purpose.

**Why:**

- **The actual problem was duplication, not staleness.** Every route sits under
  the same authenticated shell, so its layout resolves access on every
  navigation — correctly, since re-verifying the session on each request is a
  security property, not overhead to remove (see decision 5). The real issue
  was that most pages *also* called their own guard (`requireProfile()`,
  `requireBillingManager()`, …), independently repeating the identical
  `auth.getUser()` network call and `profiles` lookup the layout had just made
  — noticeable specifically as the delay between clicking a link and the next
  page appearing, since two or three redundant auth round trips ran before the
  page could even start its own queries.
- **A TTL-based cache would trade a real bug for a subtler one.** Caching the
  session for even a few seconds means a just-deactivated or just-demoted
  employee could keep acting on stale authority until it expires — unacceptable
  for a permission system whose whole design is "verify on every request."
  React's `cache()` has no such window: its scope is one render pass, so the
  *next* navigation is a fully fresh check. It only prevents the *same*
  navigation from asking the same question twice.

**Implementation:** `fetchProfileRow`, `fetchDepartmentSlugs`, and
`getUserAccess` are wrapped in `cache()` from `react`. Every existing signature
(`getProfile`, `requireProfile`, `requireAdmin`, `getUserAccess`,
`requireUserManager`, `requireBillingManager`) is unchanged — this is purely an
internal memoization, not a new API.

## 16. Activity is tracked passively; EOD is the clock-out; deleted tasks stay in history

Three linked decisions behind the reporting system.

**Passive tracking — no clock-in button.**

- **People forget to clock in, and a button measures compliance, not work.** The
  point is an honest record of when someone was actually working, not a ritual
  they have to remember. So attendance is a by-product of *using the portal*: the
  authenticated shell already runs on every navigation, so it stamps the day's
  `activity_logs` row (first-seen = "arrived", last-seen, pages, count). It's
  invisible and can't be gamed by clocking in and walking away.
- **It must add zero friction and zero latency.** The stamp is written via
  `after()` (after the response is sent), and through a `SECURITY DEFINER`
  function keyed to `auth.uid()` so nobody can forge another person's attendance.

**EOD submission = the "clock-out" timestamp.**

- **There's already a natural end-of-day action — reuse it.** Rather than a
  second "I'm leaving" button, the moment someone submits their EOD *is* their
  leave time (`eod_submitted_at`, set by a trigger). "Active for" = EOD − arrival.
  If they never submit, we fall back to their last-seen time and flag "No EOD" —
  which doubles as a gentle accountability signal.

**Deleted tasks leave current counts but stay in EOD history.**

- **A count and a history answer different questions.** "How much is on my board
  right now?" must reflect reality — a deleted task is gone, so board/pending
  counts (which read the `tasks` table) drop it immediately. "What did this person
  do that day?" is about work that happened — and finishing a task then deleting
  the card doesn't un-happen the work. So EOD/history read the immutable
  `task_activity` log, which we made **survive deletion** (`task_id` → null, with
  the title/department denormalised onto the row). One table for "now", one
  append-only log for "what happened" — each stays correct for its own question.
- **Archived ≠ deleted.** "Done" tasks auto-archive off the board after 7 days
  (still in history, recoverable); deletion removes the card entirely (but not its
  logged history). Keeping the two distinct avoids conflating "finished and filed"
  with "removed".

## 17. Team Lead authority is department-scoped, not portal-wide

**Decision:** The `team_lead` role grants elevated capability (task assignment,
reporting, and viewing) **only over the department(s) the person belongs to** —
never the whole portal. It is a scoped tier below admin/HR, not a smaller copy
of them.

**Why:**

- **A team lead's authority comes from running a team, not from rank.** The
  natural unit of their responsibility is their department — so their power
  should end exactly at that boundary. A creative-team lead has no business
  reading the finance team's EOD reports. Scoping to their departments makes the
  permission match the real-world responsibility instead of inventing a new
  global rank.
- **It reuses the model already in place.** Authority in this portal was already
  department-based (decision on the authority model): HR & Management is a
  department, not a title, and `my_department_ids()` is the unit of scope
  everywhere. Team leads slot straight into that — their scope *is* their
  department membership. No parallel concept, no per-feature ACLs.
- **Least privilege, and it composes.** Team leads explicitly cannot manage
  staff, clear invoices, change roles, or see other departments — those stay
  with admins + HR. RLS already limits reporting/EOD/task reads to shared
  departments, so the database enforces the boundary; the app layer only adds
  the *page access* (the Reporting UI) and scopes each page's employee list to
  the viewer's departments. If a team lead leads two departments, they see both,
  automatically — the scope follows membership with no extra wiring.

**Implementation:** `role = 'team_lead'` + `is_team_lead()`; `getUserAccess()`
exposes `isTeamLead` / `canViewReports` and the caller's `departmentIds`.
`requireReportViewer()` gates `/reporting`, and each reporting page filters to
`departmentIds` when the viewer isn't a full manager. Staff management and
billing-clear gates (`canManageUsers` / `canManageBilling`) remain admins + HR.

## 18. Task visibility is role-scoped, enforced in the database

**Decision:** Who can *see* a task follows the same three-tier shape as the rest
of the portal, and it's enforced by RLS — not hidden in the UI:

- **employee** → only their own tasks (created by or assigned to them);
- **team lead** → every task in their department(s);
- **admin / HR** → all tasks, everywhere.

Assignment mirrors it: an employee can only assign to themselves, a team lead
only to people in their department(s), admins/HR to anyone.

**Why:**

- **Tasks are personal work, not shared documents.** The original design let any
  employee see their whole department's board — fine for a tiny team, but the
  Influencer trial showed it's wrong: an individual contributor doesn't need
  (or want) to see everyone else's task list. The person who *does* need the
  department view is the one responsible for the department — the team lead. So
  visibility maps to responsibility: you see your own work; your team lead sees
  the team's; admins/HR see everything.
- **It must hold at the data layer, not the UI.** Hiding rows in React is not
  security — a crafted query would still return them. The rules live in the
  `tasks` RLS policies (`tasks_select` for visibility, `can_assign_to()` in the
  insert/update checks, plus the rules trigger), so the boundary holds even if
  the client is bypassed. The UI simply matches what the database already
  enforces (better UX, not the enforcement).
- **It reuses the department-scoped model (decision 17).** Team-lead scope is
  their `profile_departments` membership via `my_department_ids()` /
  `can_assign_to()` — no new concept, and a lead who runs two departments sees
  both automatically.

**Implementation:** migration `0015` — `tasks_select` (own / team-lead-dept /
manager), `can_assign_to(target)` used in `tasks_insert` / `tasks_update` checks
and the `tasks_enforce_rules` trigger. The app's server actions and the Team
view branch on `getUserAccess()` (`isTeamLead` / `canManageUsers`) to match.

## 19. HR & Management is both a role and a department-based permission

**Decision:** Keep the existing "HR & Management = member of the HR & Management
department" rule **and** add `hr_management` as an assignable account role.
Either one grants the same authority (`is_hr_management()` returns true for
both).

**Why:** The department-based model came first and everything already depends on
it (RLS policies, `can_manage_users()`, `can_manage_billing()`, the reporting
scope). Ripping it out to move to a role would be a risky, wide-reaching change
for no functional gain. But departments are about *what team you're on*, and HR
authority isn't always tied to a team — sometimes you just want to grant one
person HR powers directly. Adding the role as a **second, additive** source of
the same permission gives that flexibility with zero backward-compatibility risk:
`is_hr_management()` simply ORs the two checks, so every existing policy keeps
working untouched.

## 20. Employees get a department-unique default *note* colour

**Decision:** Assign each employee a default sticky-note colour that no one else
in their department shares, and use it as the **note's background** for their
tasks when no custom colour is set. Identity is carried by the *whole note's
colour*, not a small dot beside the name (an earlier iteration used a dot — it
was too easy to miss on a dense board).

**Why:** On the Team and Manage boards you're scanning a wall of notes and the
question is "whose is this?". Names require reading; the entire card taking on a
person's colour is recognisable at a glance from across the screen — far more so
than a 2 px dot. Uniqueness *within a department* is what matters — that's the
group you compare within — so colours only need to be distinct there, which the
ten-colour palette easily covers. People in multiple departments get one stable
colour (their primary department's) so their identity doesn't flicker between
views. Priority is explicit: a manually-chosen note colour wins, then the
assignee's default, then the department colour (for unassigned notes). The pool
is the same `NOTE_COLORS` palette used by the manual picker, so defaults and
manual choices always look consistent.

---

## Summary

| Decision        | Choice           | Primary driver                              |
| --------------- | ---------------- | ------------------------------------------- |
| Framework       | Next.js App Router | Full-stack, server-side auth, modular routing |
| Backend         | Supabase         | Auth + Postgres + RLS in one platform        |
| Hosting         | Vercel           | First-party Next.js CI/CD, preview deploys   |
| Registration    | Invite-only      | Internal tool; controlled, secure onboarding |
| Authorization   | Row Level Security | Defense in depth at the data layer          |
| Authority model | Department-based (multi-dept) | Matches shared, cross-department authority |
| Invoice PDFs    | Client-side (jsPDF) | Instant, dependency-light, exact preview   |
| Invoice designs | Eight templates  | Avoid mass-produced look / tax scrutiny      |
| Billing UX      | Three separate tools | Focused screens; clearing locked to admins/HR |
| Expense tracking| One invoices table | Built-in who-created / who-cleared trail    |
| Analytics       | In-process + CSS bars | Right-sized, migration-free, no chart dep |
| Employee removal| Soft deactivation | Preserve audit trail (FK restrict); reversible |
| Chat realtime   | One RLS-scoped subscription | One stream drives all; no policy recursion |
| Notifications   | Server-only writes; DMs ping, mentions ping | Unspoofable; notify without spamming |
| Auth memoization| React `cache()`, request-scoped | Kill duplicate auth calls, zero staleness risk |
| Activity tracking| Passive; EOD = clock-out | Honest record, no ritual; reuse a natural action |
| Deleted tasks   | Drop from counts, keep in EOD | "Now" vs "what happened" are different questions |
| Team Lead role  | Department-scoped, not portal-wide | Authority follows responsibility; reuses dept model |
| Task visibility | Role-scoped, RLS-enforced | Tasks are personal work; boundary must hold at DB layer |
| HR & Management | Role OR department | Additive; flexibility with zero backward-compat risk |
| Employee colours| Department-unique default | Tell whose task is whose at a glance |
| Dropdowns       | Portal to body + backdrop | Escape the tilted card's stacking context |
