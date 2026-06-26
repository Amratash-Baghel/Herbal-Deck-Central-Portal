<div align="center">

# 🌿 Herbal Deck Portal

**A modular, full-stack internal employee portal** that consolidates Herbal
Deck's internal tools behind one secure, role-aware interface.

Next.js 16 · React 19 · TypeScript · Tailwind CSS v4 · Supabase · Vercel

</div>

---

## What this is

An invite-only internal portal built on a **shell + modules** architecture: a
shared foundation (authentication, roles, navigation, theming, layout) into
which self-contained feature modules are added over time. This release ships the
foundation plus placeholder modules; per-module business logic follows.

- **Invite-only auth** — email + password via Supabase Auth; no public sign-up.
  Admins provision accounts from inside the portal.
- **Two roles** — `admin` and `employee`, enforced both in the app and in the
  database.
- **Defense in depth** — application-level guards *and* PostgreSQL **Row Level
  Security** protect data.
- **Premium, themeable UI** — light/dark modes in the Herbal Deck brand palette.

## Quick start

```bash
npm install
cp .env.local.example .env.local     # add your Supabase keys
# run supabase/schema.sql in the Supabase SQL Editor (one time)
npm run dev                          # http://localhost:3000
```

Full setup, environment variables, and database bootstrap instructions are in
**[`docs/README.md`](./docs/README.md)**.

## Documentation

| Document | Contents |
| -------- | -------- |
| [docs/README.md](./docs/README.md) | Project overview, stack, setup, deployment |
| [docs/architecture.md](./docs/architecture.md) | Folder structure, module isolation, adding a module |
| [docs/decisions.md](./docs/decisions.md) | Why Next.js, Supabase, Vercel, invite-only auth, RLS |
| [docs/CHANGELOG.md](./docs/CHANGELOG.md) | Release history |

## Project layout

```
app/          Routes — login, authenticated (dashboard) group, auth handlers
components/   Reusable UI — sidebar, cards, theme toggle, icons
lib/          Supabase clients, auth helpers, types, navigation config
supabase/     schema.sql — tables, trigger, and Row Level Security policies
docs/         Engineering documentation
```

## Scripts

| Command | Description |
| ------- | ----------- |
| `npm run dev` | Start the local dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | Lint the codebase |

---

<sub>Built using AI-assisted development workflows, with full ownership of the
product, architecture, and technical decisions.</sub>
