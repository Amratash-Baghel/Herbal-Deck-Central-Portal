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

---

## Summary

| Decision        | Choice           | Primary driver                              |
| --------------- | ---------------- | ------------------------------------------- |
| Framework       | Next.js App Router | Full-stack, server-side auth, modular routing |
| Backend         | Supabase         | Auth + Postgres + RLS in one platform        |
| Hosting         | Vercel           | First-party Next.js CI/CD, preview deploys   |
| Registration    | Invite-only      | Internal tool; controlled, secure onboarding |
| Authorization   | Row Level Security | Defense in depth at the data layer          |
