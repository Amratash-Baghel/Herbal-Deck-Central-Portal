# Herbal Deck Portal

An internal employee portal for **Herbal Deck** — a modular, full-stack platform
that consolidates the company's internal tools behind a single, secure,
role-aware interface.

The portal is built as a **shell + modules** architecture: a shared foundation
(authentication, departments, navigation, theming, layout) into which
self-contained feature modules are added over time. The foundation and User
Management are live, the **Billing** module has shipped (generate / post / clear),
and Chat is next.

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

Authority runs through **departments**, not titles: the **HR & Management**
department can manage staff and billing alongside the owner-level admins, and
employees can belong to more than one department.

Current modules:

| Module             | Status        | Notes                                            |
| ------------------ | ------------- | ------------------------------------------------ |
| Dashboard          | ✅ Live        | Tool launcher; data-driven card grid             |
| Billing & Invoices  | ✅ Live        | Generate (8 templates) · Post · Clear · Analytics |
| Employee Management | ✅ Live        | Add, assign departments, remove (soft) — admin / HR |
| Chat               | ✅ Live        | Real-time DMs & groups, @mentions (links for files) |
| Notifications      | ✅ Live        | Realtime bell + pop-ups; invoice-posted alerts    |
| Tasks              | ✅ Live        | Personal kanban + team/admin views + auto EOD reports |
| Reporting          | ✅ Live        | Passive activity log, team overview, EOD viewer, per-employee reviews — admin / HR |

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

Account creation is restricted to **admins and the HR & Management department**.
They add employees via the User Management module; the server uses a privileged
service-role key (never exposed to the browser) to create the account, and a
database trigger provisions the matching profile and role. Page/action guards
(`requireProfile`, `requireUserManager`, `requireBillingManager`) mirror the
database's `can_manage_users()` / `can_manage_billing()` helpers so the UI and
RLS agree on who can do what.

Employees manage their own password through Supabase Auth's **recovery flow**:
`/forgot-password` emails a reset link → `/auth/confirm` verifies it and
establishes a session → `/reset-password` sets the new password. No email-template
editing is required — the app passes a `redirectTo` of `/auth/confirm`, which the
default email respects; that URL just needs to be in **Auth → URL Configuration →
Redirect URLs** (see the changelog's 0.5.1 setup note).

## Project structure

A high-level view (full detail in [`architecture.md`](./architecture.md)):

```
app/
  (dashboard)/        # Authenticated shell: sidebar layout + protected pages
    dashboard/        # Tool launcher
    billing/          # Billing module — tabs layout + actions
      generate/       #   invoice generator (8 templates, download only)
      post/           #   post an invoice into tracking
      clearing/       #   clear/reject posted invoices (admin / HR only)
    chat/             # Chat module (placeholder)
    users/            # User Management (admin / HR & Management)
  login/              # Public login page + sign-in server action
  auth/signout/       # Sign-out route handler
components/           # Reusable UI (sidebar, invoice generator/forms, etc.)
lib/                  # Supabase clients, auth, invoice PDF + templates, money
supabase/
  schema.sql          # base tables, trigger, RLS
  migrations/         # 0002 departments + billing, 0003 invoice posting
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

In the Supabase SQL Editor, run these **once, in order**:

1. [`supabase/schema.sql`](../supabase/schema.sql) — the `profiles` table, role
   enum, auto-provisioning trigger, `is_admin()` helper, and base RLS policies.
   Its footer explains how to bootstrap your first admin account.
2. [`supabase/migrations/0002_departments_and_billing.sql`](../supabase/migrations/0002_departments_and_billing.sql)
   — departments, multi-department membership, the `can_manage_*` helpers, the
   billing tables, and the private storage buckets.
3. [`supabase/migrations/0003_invoice_posting.sql`](../supabase/migrations/0003_invoice_posting.sql)
   — adds the `reason` column used when posting an invoice.
4. [`supabase/migrations/0004_employee_deactivation.sql`](../supabase/migrations/0004_employee_deactivation.sql)
   — adds `deactivated_at` for soft-removing employees.
5. [`supabase/migrations/0005_chat_and_notifications.sql`](../supabase/migrations/0005_chat_and_notifications.sql)
   — the chat tables (`conversations`, `conversation_participants`, `messages`),
   the `notifications` inbox, their RLS and helper functions, the realtime
   publication, and a broadened `profiles` read policy (the chat directory).
6. [`supabase/migrations/0006_tasks_and_reporting.sql`](../supabase/migrations/0006_tasks_and_reporting.sql)
   — the `tasks` board, the append-only `task_activity` log, and `eod_reports`,
   with their triggers, `SECURITY DEFINER` reporting helpers, and RLS.
7. [`supabase/migrations/0007_tasks_assignment_rules.sql`](../supabase/migrations/0007_tasks_assignment_rules.sql)
   — the task assign/move/delete rules (trigger + creator-only delete).
8. [`supabase/migrations/0008_performance_indexes.sql`](../supabase/migrations/0008_performance_indexes.sql)
   — indexes for query patterns that weren't covered.
9. [`supabase/migrations/0009_activity_logs.sql`](../supabase/migrations/0009_activity_logs.sql)
   — the `activity_logs` (passive attendance) table, `record_activity()`, and
   the EOD "clock-out" trigger.
10. [`supabase/migrations/0010_task_history_and_timestamps.sql`](../supabase/migrations/0010_task_history_and_timestamps.sql)
   — `tasks.started_at`; makes `task_activity` durable + denormalised; the
   `task_activity_log` view; and `archive_stale_done_tasks()`.

After setup, assign yourself (and your CTO) to the **HR & Management** department
— or keep `role = 'admin'` — so billing and user management unlock. Chat and
notifications work for everyone with no extra configuration — migration `0005`
enables realtime and the app produces notifications on its own.

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

## About this project

Every problem this portal solves was identified firsthand from how Herbal Deck
actually operates, and every product and architectural decision — the
department-based permission model, the invoice workflow, the move to multiple
invoice templates — was made independently by the project owner. The aim
throughout is to **streamline, organise, and standardise** the company's
internal operations, and to keep them secure. This documentation reflects the
engineering standard intended for the platform as it grows.
