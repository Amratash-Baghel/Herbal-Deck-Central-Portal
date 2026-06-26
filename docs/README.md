# Herbal Deck Portal

An internal employee portal for **Herbal Deck** — a modular, full-stack platform
that consolidates the company's internal tools behind a single, secure,
role-aware interface.

The portal is built as a **shell + modules** architecture: a shared foundation
(authentication, roles, navigation, theming, layout) into which self-contained
feature modules (Billing, Chat, and more to come) are added over time. This
first release delivers that foundation and the placeholder modules; business
logic for each module is layered in subsequently.

---

## Table of contents

- [Overview](#overview)
- [Technology stack](#technology-stack)
- [Authentication & access control](#authentication--access-control)
- [Project structure](#project-structure)
- [Local development](#local-development)
- [Environment variables](#environment-variables)
- [Database setup](#database-setup)
- [Deployment pipeline](#deployment-pipeline)
- [Further documentation](#further-documentation)
- [Development approach](#development-approach)

---

## Overview

The portal provides Herbal Deck employees a single place to access internal
tooling. Access is **invite-only** — there is no public sign-up. Administrators
provision accounts from inside the portal, and every user is assigned one of two
roles (`admin` or `employee`) that determines what they can see and do.

Current modules:

| Module             | Status        | Notes                                            |
| ------------------ | ------------- | ------------------------------------------------ |
| Dashboard          | ✅ Live        | Tool launcher; data-driven card grid             |
| Billing & Invoices | 🧱 Placeholder | Route + UI shell; business logic to follow        |
| Chat               | 🧱 Placeholder | UI layout only; real-time messaging to follow     |
| User Management    | ✅ Live (admin) | Add employees, view team, role-based visibility  |

## Technology stack

| Layer            | Technology                                  |
| ---------------- | ------------------------------------------- |
| Framework        | Next.js 16 (App Router) + React 19          |
| Language         | TypeScript (strict)                         |
| Styling          | Tailwind CSS v4 (CSS-based design tokens)   |
| Backend / DB     | Supabase (PostgreSQL, Auth, Row Level Security) |
| Auth sessions    | `@supabase/ssr` (cookie-based, SSR-safe)    |
| Hosting / CI/CD  | Vercel (Git-driven deployments)             |

See [`decisions.md`](./decisions.md) for the rationale behind each choice.

## Authentication & access control

Security is enforced in **two independent layers**, so a gap in one does not
expose data:

1. **Application layer** — a Next.js proxy (middleware) refreshes the session on
   every request and redirects unauthenticated users to `/login`. Server-side
   guards (`requireProfile`, `requireAdmin`) gate pages and actions by role.
2. **Database layer** — **Row Level Security (RLS)** policies in PostgreSQL
   enforce access on the data itself. Even if the UI were bypassed, an employee
   cannot read another user's data, because the database refuses the query.

Account creation is **admin-only**. Admins add employees via the User Management
module; the server uses a privileged service-role key (never exposed to the
browser) to create the account, and a database trigger provisions the matching
profile and role.

## Project structure

A high-level view (full detail in [`architecture.md`](./architecture.md)):

```
app/
  (dashboard)/        # Authenticated shell: sidebar layout + protected pages
    dashboard/        # Tool launcher
    billing/          # Billing module (placeholder)
    chat/             # Chat module (placeholder)
    users/            # User Management (admin only)
  login/              # Public login page + sign-in server action
  auth/signout/       # Sign-out route handler
components/           # Reusable UI (sidebar, cards, theme toggle, icons)
lib/                  # Supabase clients, auth helpers, types, navigation config
supabase/             # schema.sql — tables, trigger, and RLS policies
docs/                 # This documentation set
```

## Local development

> Prerequisites: Node.js 20+ and a free Supabase project.

```bash
# 1. Install dependencies
npm install

# 2. Configure environment (see below)
cp .env.local.example .env.local   # then fill in your Supabase keys

# 3. Run the database schema (see "Database setup")

# 4. Start the dev server
npm run dev
```

Visit **http://localhost:3000**. You will be redirected to `/login`.

## Environment variables

Copy `.env.local.example` to `.env.local` and provide:

| Variable                        | Exposure      | Purpose                                  |
| ------------------------------- | ------------- | ---------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Public        | Supabase project URL                     |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public        | Anonymous client key (RLS-protected)     |
| `SUPABASE_SERVICE_ROLE_KEY`     | **Secret**    | Server-only; admin user provisioning     |

All values come from **Supabase Dashboard → Project Settings → API**. The
service-role key must never be prefixed with `NEXT_PUBLIC_` or used in client
code.

## Database setup

Run [`supabase/schema.sql`](../supabase/schema.sql) once in the Supabase SQL
Editor. It creates the `profiles` table, the role enum, the auto-provisioning
trigger, an `is_admin()` helper, and the RLS policies. The file's footer
explains how to bootstrap your first admin account.

## Deployment pipeline

The portal is designed for **Vercel** with a Git-driven workflow:

1. Push to a Git provider (e.g. GitHub).
2. Import the repository into Vercel.
3. Add the three environment variables in the Vercel project settings.
4. Every push to the production branch triggers a build and deploy; pull
   requests receive isolated preview deployments.

No build step beyond `next build` is required; Vercel detects Next.js
automatically.

## Further documentation

- [`architecture.md`](./architecture.md) — folder structure, module isolation,
  and a step-by-step guide to adding a new module.
- [`decisions.md`](./decisions.md) — the reasoning behind Next.js, Supabase,
  Vercel, invite-only auth, and Row Level Security.
- [`CHANGELOG.md`](./CHANGELOG.md) — release history.

## Development approach

This project was built using **AI-assisted development workflows**. All product
direction, architecture, and technical decisions were owned and directed by the
project owner; AI was used as an implementation accelerator within those
decisions. The documentation set reflects the intended engineering standard for
the platform as it grows.
