# Architecture

This document describes how the Herbal Deck Portal is organized, the principles
that keep it maintainable as it grows, and the exact steps to add a new module.

## Guiding principle: shell + modules

The portal is a **shell** (shared foundation) into which **modules** (features)
plug. The shell owns authentication, session management, role resolution,
navigation, theming, and page layout. A module owns one business capability
(e.g. Billing) and nothing else. Modules do not reimplement auth or layout —
they inherit it by living inside the authenticated route group.

This separation means a new module is additive: you create its route and add it
to one navigation list, and it automatically receives auth protection, the
sidebar, theming, and responsive layout.

## Folder structure

```
app/
  layout.tsx              # Root layout: fonts, metadata, pre-paint theme script
  globals.css             # Tailwind import + design tokens (light/dark)
  page.tsx                # Root route → redirects into /dashboard
  login/
    page.tsx              # Public login screen (Client Component)
    actions.ts            # "login" Server Action (Supabase signInWithPassword)
  auth/
    signout/route.ts      # POST handler that signs out and redirects to /login
  (dashboard)/            # Route GROUP — the authenticated shell
    layout.tsx            # Renders <Sidebar>; calls requireProfile() (gate)
    dashboard/page.tsx    # Tool launcher (data-driven card grid)
    billing/              # Billing module
      layout.tsx          #   sub-nav tabs (Generate / Post / Clear)
      page.tsx            #   overview
      generate/page.tsx   #   invoice generator (8 templates, download only)
      post/page.tsx       #   post an invoice into tracking
      clearing/page.tsx   #   clear/reject posted invoices (admins + HR only)
      actions.ts          #   post / delete / clear / reject / upload actions
    chat/                 # Chat module
      page.tsx            #   loads directory + conversations (server), then client
      actions.ts          #   send / startDM / createGroup / rename / add / remove / leave
    tasks/                # Tasks & Reporting module
      layout.tsx          #   sub-nav tabs (My Board / Team / Reports / Manage)
      page.tsx            #   My Board (personal kanban)
      team/page.tsx       #   department view (read-only, filterable)
      manage/page.tsx     #   all-departments dashboard (admins + HR only)
      reports/page.tsx    #   EOD reports (auto-generated from activity)
      actions.ts          #   create / move / update / archive / delete / saveEodNote
    employees/
      page.tsx            # Employee Management (admins + HR & Management)
      actions.ts          # invite / setDepartments / deactivate / reactivate

components/               # Reusable, presentational UI
  sidebar.tsx             # Role-filtered nav, branding, user info, logout, bell
  tool-card.tsx           # Dashboard tool card (typed by the Tool interface)
  page-header.tsx         # Shared page title/description block
  invite-user-form.tsx    # Client form bound to the inviteUser action
  theme-toggle.tsx        # Light/dark switch (persists to localStorage)
  logo.tsx                # Herbal Deck brand mark
  icons.tsx               # Inline SVG icon set (no icon dependency)
  chat/                   # Chat client UI
    chat-client.tsx       #   list + live thread + realtime message subscription
    message-composer.tsx  #   input with the @mention picker
    new-conversation-dialog.tsx  # start a DM or create a group
    group-settings-dialog.tsx    # rename / add / remove / leave (admins)
    types.ts              #   DirectoryEntry, ConversationSummary
  notifications/          # Notification UI (one realtime subscription, shared)
    notifications-provider.tsx   # context + subscription + state (wraps the shell)
    notification-bell.tsx        # unread badge + dropdown
    notification-toaster.tsx     # auto-dismissing pop-ups
    notification-icon.tsx        # glyph per notification type
  tasks/                  # Tasks & Reporting UI
    task-board.tsx        #   My Board (DnD, quick-add, optimistic)
    task-card.tsx         #   the sticky note (dept colour, deadline)
    task-detail-dialog.tsx#   view / edit a card
    task-list.tsx         #   filterable read-only list (Team + Manage)
    eod-note-form.tsx     #   finalise today's EOD report
    types.ts              #   Person, DeptRef
  tasks-tabs.tsx          # Tasks sub-navigation

lib/                      # Non-visual logic and configuration
  supabase/
    client.ts             # Browser Supabase client (anon key)
    server.ts             # Server Supabase client (anon key, cookie session)
    admin.ts              # Service-role client (server-only, bypasses RLS)
    middleware.ts         # updateSession(): session refresh + route guard
  auth.ts                 # getProfile / requireProfile / requireAdmin /
                          #   getUserAccess / requireUserManager / requireBillingManager
                          #   (request-memoized via React cache() — see "Performance")
  perf.ts                 # time(): logs how long a page's data loading took
  notifications.ts        # notifyUsers / getManagementUserIds (server, service-role)
  invoice-pdf.ts          # builds the invoice PDF (jsPDF); dispatches to a template
  invoice-templates.ts    # the eight invoice templates
  invoice-types.ts        # invoice model + draw context (jsPDF-free, shared)
  money.ts                # currency formatting (screen symbols vs PDF-safe ASCII)
  company.ts              # fixed Herbal Deck details (invoice bill-to)
  tasks.ts                # kanban columns, status helpers, per-department colours
  time.ts                 # relative-time / clock / day-label + IST day helpers
  navigation.tsx          # navItems[]: single source of truth for the sidebar
  types.ts                # Role, Profile, Department, Invoice, Conversation, Task, ...

proxy.ts                  # Next.js 16 proxy (middleware) entry point
supabase/
  schema.sql              # Base tables, trigger, is_admin(), RLS policies
  migrations/             # 0002 departments+billing, 0003 posting, 0004 deactivation,
                          #   0005 chat + notifications, 0006 tasks + reporting
docs/                     # Documentation set
  modules/                # Per-module deep dives (e.g. tasks-and-reporting.md)
```

## How requests flow

1. **`proxy.ts`** runs first. It calls `updateSession()`, which refreshes the
   Supabase auth cookie and redirects unauthenticated users away from protected
   routes (and authenticated users away from `/login`).
2. The matched **route group layout** (`app/(dashboard)/layout.tsx`) calls
   `requireProfile()`, loading the user's profile (and role) server-side. If
   there is no session, it redirects to `/login`.
3. The **page** renders. Restricted pages additionally call a guard —
   `requireAdmin()` (owner-only), or `requireUserManager()` /
   `requireBillingManager()` (admins + HR & Management) — which redirects anyone
   without that authority back to the dashboard.
4. Any **data access** goes through a Supabase client and is filtered by **Row
   Level Security** in the database — the final, authoritative access check.

## How modules are isolated

- **Routing isolation** — each module is a folder under `app/(dashboard)/`.
  Modules never import one another's internals; shared needs live in
  `components/` or `lib/`.
- **Auth inheritance** — modules don't handle auth. The group layout guarantees
  a signed-in user before any module page renders.
- **Data isolation** — each module's tables get their own RLS policies in the
  database. Access rules live with the data, not scattered through UI code.
- **Navigation as data** — the sidebar renders from `lib/navigation.tsx`. A
  module appears in the nav by adding one entry, optionally `managerOnly` (shown
  only to admins + HR & Management).
- **Presentation reuse** — `PageHeader`, `ToolCard`, and the design tokens give
  every module a consistent look without copy-pasted styling.

## Real-time and notifications

Chat and the notification bell are the portal's first live features, built on
**Supabase Realtime** (Postgres Changes). Two principles keep this simple:

- **One subscription each, scoped by RLS.** The chat client subscribes to
  *message inserts* with no client-side filter; Row Level Security delivers only
  rows in conversations the user belongs to. That single stream drives the open
  thread, unread badges, and re-ordering. The `NotificationsProvider` (wrapping
  the whole authenticated shell) owns one subscription to the user's
  *notification inserts*, feeding both the sidebar bell and the toast pop-ups.
- **Notifications are written server-side only.** The `notifications` table has
  no INSERT policy, so the browser can never create one for another user. They
  are produced exclusively by the service-role client inside authenticated
  Server Actions, via `lib/notifications.ts` — the same trusted-elevation pattern
  used for admin user provisioning and signed-invoice uploads.

Membership checks for chat (`is_conversation_participant`,
`is_conversation_admin`) are `SECURITY DEFINER` SQL functions, mirroring the
`is_admin()` pattern: a policy that queried the participants table directly would
recurse, so the helpers read it without re-triggering RLS.

## Performance

Every route lives under the same authenticated shell (`app/(dashboard)/layout.tsx`),
so its auth check runs on every navigation — by design, for security. Two
conventions keep that from being paid for twice:

- **Request-scoped memoization.** `lib/auth.ts`'s helpers (`getProfile`,
  `getUserAccess`, and everything built on them) are wrapped in React's
  `cache()`. The layout resolves access once; if a page's own guard
  (`requireProfile()`, `requireBillingManager()`, …) calls the same underlying
  function again, it reuses that request's result instead of re-querying. This
  is scoped to a single render pass — every navigation still gets a fully fresh
  check — it just stops the *same* navigation from checking twice.
- **Select only what's rendered.** Pages select an explicit column list rather
  than `select("*")` wherever a table has columns the UI doesn't use (see
  `INVOICE_LIST_COLUMNS` / `TASK_LIST_COLUMNS` in `lib/types.ts`). Bulk
  per-row work (like invoice signed URLs) uses Storage's batched
  `createSignedUrls()` instead of one request per row.

`lib/perf.ts` wraps a page's data-loading step in `time(label, fn)`, logging how
long it took — visible in Vercel's Runtime Logs, no extra service required.
`@vercel/speed-insights` is mounted in the root layout for real per-page Core
Web Vitals (enable "Speed Insights" once in the Vercel project settings).

## Theming

Design tokens are defined as CSS custom properties in `app/globals.css` and
exposed to Tailwind via `@theme`. Components use **semantic** utilities
(`bg-background`, `text-foreground`, `bg-primary`, `bg-muted`, `border`), so
dark mode is achieved by flipping the `dark` class on `<html>` — no per-element
dark variants required. The class is applied pre-paint by a small script in the
root layout to avoid a flash of the wrong theme.

## Adding a new module

Example: adding a "Reports" module.

1. **Create the page**
   `app/(dashboard)/reports/page.tsx`:
   ```tsx
   import { requireProfile } from "@/lib/auth";
   import { PageHeader } from "@/components/page-header";

   export default async function ReportsPage() {
     await requireProfile();
     return <PageHeader title="Reports" description="Operational reporting." />;
   }
   ```
   (Use `requireAdmin()`, `requireUserManager()`, or `requireBillingManager()`
   instead if the module should be restricted.)

2. **Add an icon** in `components/icons.tsx` (follow the existing pattern).

3. **Register navigation** in `lib/navigation.tsx`:
   ```ts
   { label: "Reports", href: "/reports", icon: ReportsIcon },
   ```
   Add `adminOnly: true` to restrict it to admins.

4. **(Optional) Surface it on the dashboard** by adding a `Tool` entry to the
   `tools` array in `app/(dashboard)/dashboard/page.tsx`.

5. **(If it stores data) Add tables + RLS** to `supabase/schema.sql` and run it
   in Supabase. Always enable RLS and write policies; never rely on the UI
   alone for access control.

The module now has authentication, the sidebar, theming, and responsive layout
with no additional wiring.
