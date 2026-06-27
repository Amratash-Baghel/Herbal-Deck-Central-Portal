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
