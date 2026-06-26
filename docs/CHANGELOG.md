# Changelog

All notable changes to the Herbal Deck Portal are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
- Built using AI-assisted development workflows, with architecture and technical
  decisions owned by the project owner.
