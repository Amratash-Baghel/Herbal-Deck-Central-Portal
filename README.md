# Herbal Deck Portal

Herbal Deck needed one place for employees to access internal tools. There was no central hub — billing was handled in one place, communication in another, and there was no consistent way to control who had access to what. Every new tool meant another login, another permission system, another thing to manage.

This portal was built to fix that.

---

## The idea

The goal was simple: one login, one place, everything the team needs. But the way it's built matters — adding a new tool to the portal should be straightforward, not a project of its own. So instead of building a fixed app, the architecture is designed as a **shell with modules**: a solid foundation that new features plug into cleanly, one at a time.

The first release ships that foundation. Billing and Chat are already outlined as the next modules — they just need the business logic layered in.

---

## What it does today

- Employees sign in with their email and password — **no self-registration**. The only way in is if an admin adds you.
- Two types of accounts: **admins** (can manage the team, see everything) and **employees** (see their own tools and data).
- A clean dashboard with a sidebar that adjusts based on your role — employees see their tools, admins see everything plus a User Management section.
- Admins can add new employees directly from inside the portal without touching Supabase or any backend system.
- Light and dark mode, built around Herbal Deck's brand colors.

---

## Why these tools

**Next.js** — This is the framework the app is built on. The reason for choosing it is that it handles both the frontend (what users see) and the backend (login, database queries, security) in one codebase. No separate API server to manage. It also means security checks happen on the server before anything gets shown to the user — not after the fact in the browser.

**Supabase** — Handles authentication, the database, and data security rules all in one place. The alternative would be stitching together separate services for each of those things. Supabase keeps it cohesive. It's also built on PostgreSQL, which is a battle-tested database with proper SQL — not a proprietary system that locks you in.

**Row Level Security** — This is the part most people skip, and it's what makes the access control actually trustworthy. Instead of just hiding things in the UI, the *database itself* enforces who can read or write what. Even if there were a bug in the app, the data would still be protected. An employee's data is inaccessible to other employees — not just hidden, but refused at the query level.

**Vercel** — Deploying the app is a git push. That's it. Vercel handles scaling, HTTPS, and infrastructure. It's the obvious choice for a Next.js app and removes the need to manage servers.

**Invite-only accounts** — This was a deliberate product decision. It's an internal tool for a vetted team. Open sign-up doesn't belong here. Admins control access, which means there's always a clear record of who has access and why.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| Auth & Database | Supabase (PostgreSQL) |
| Hosting | Vercel |

---

## Running locally

```bash
npm install
cp .env.local.example .env.local   # fill in your Supabase keys
npm run dev                         # http://localhost:3000
```

You'll also need to run `supabase/schema.sql` once in the Supabase SQL Editor to set up the database tables and security rules. Full instructions are in [`docs/README.md`](./docs/README.md).

---

## Project layout

```
app/          Every page — login, dashboard, billing, chat, user management
components/   Sidebar, cards, theme toggle, icons
lib/          Database connections, auth logic, navigation config
supabase/     The database schema and security rules
docs/         Full engineering documentation
```

---

## Documentation

| | |
|---|---|
| [docs/README.md](./docs/README.md) | Full setup and deployment guide |
| [docs/architecture.md](./docs/architecture.md) | How the codebase is structured and how to add a new module |
| [docs/decisions.md](./docs/decisions.md) | Detailed reasoning behind every technical decision |
| [docs/CHANGELOG.md](./docs/CHANGELOG.md) | What's been built and when |

---

*Built with AI-assisted workflows. All product direction, architecture, and technical decisions were owned and driven by the project owner.*
