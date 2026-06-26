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
    billing/page.tsx      # Billing module (placeholder)
    chat/page.tsx         # Chat module (placeholder)
    users/
      page.tsx            # User Management (admin only)
      actions.ts          # "inviteUser" Server Action (admin-guarded)

components/               # Reusable, presentational UI
  sidebar.tsx             # Role-filtered nav, branding, user info, logout
  tool-card.tsx           # Dashboard tool card (typed by the Tool interface)
  page-header.tsx         # Shared page title/description block
  invite-user-form.tsx    # Client form bound to the inviteUser action
  theme-toggle.tsx        # Light/dark switch (persists to localStorage)
  logo.tsx                # Herbal Deck brand mark
  icons.tsx               # Inline SVG icon set (no icon dependency)

lib/                      # Non-visual logic and configuration
  supabase/
    client.ts             # Browser Supabase client (anon key)
    server.ts             # Server Supabase client (anon key, cookie session)
    admin.ts              # Service-role client (server-only, bypasses RLS)
    middleware.ts         # updateSession(): session refresh + route guard
  auth.ts                 # getProfile / requireProfile / requireAdmin
  navigation.tsx          # navItems[]: single source of truth for the sidebar
  types.ts                # Role, Profile

proxy.ts                  # Next.js 16 proxy (middleware) entry point
supabase/schema.sql       # Tables, trigger, is_admin(), RLS policies
docs/                     # Documentation set
```

## How requests flow

1. **`proxy.ts`** runs first. It calls `updateSession()`, which refreshes the
   Supabase auth cookie and redirects unauthenticated users away from protected
   routes (and authenticated users away from `/login`).
2. The matched **route group layout** (`app/(dashboard)/layout.tsx`) calls
   `requireProfile()`, loading the user's profile (and role) server-side. If
   there is no session, it redirects to `/login`.
3. The **page** renders. Admin-only pages additionally call `requireAdmin()`,
   which redirects employees to the dashboard.
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
  module appears in the nav by adding one entry, optionally `adminOnly`.
- **Presentation reuse** — `PageHeader`, `ToolCard`, and the design tokens give
  every module a consistent look without copy-pasted styling.

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
   (Use `requireAdmin()` instead if the module is admin-only.)

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
