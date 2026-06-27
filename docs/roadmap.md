# Product Roadmap & Data Model

This document captures the planned evolution of the Herbal Deck Portal beyond
the initial shell, and the data model the platform is built on. It exists so
that anyone joining the project understands not just the current code, but the
direction and the reasoning behind the structure.

---

## The organisation it models

Herbal Deck is ~40 people across seven departments:

**Tech · Creative · Influencer · Video Editing · Graphic Designing · HR &
Management · Ecommerce**

Two facts drive the whole permission model:

1. **Authority runs through departments, not job titles.** Specifically, **HR &
   Management** holds operational authority — they manage employees and oversee
   all billing.
2. **People can belong to more than one department.** Most belong to one, but
   the model supports multiple (e.g. someone in both Creative and Influencer).

## Permission tiers

| Tier | Who | Authority |
| ---- | --- | --------- |
| **Admin / Owner** | The founder and CTO | Everything, system-wide |
| **HR & Management** | Members of that department | Manage employees; view & clear all invoices; manage miscellaneous payments |
| **Member** | Everyone else | Own tools; create/upload invoices; see invoices and chat for their department(s) |
| **Team Lead** *(planned)* | Per department | A middle tier, introduced alongside task assignment & EOD reports |

These tiers are enforced in the database via helper functions and Row Level
Security (see `supabase/migrations/0002_departments_and_billing.sql`):

- `is_admin()` — owner-level (founder, CTO)
- `is_hr_management()` — member of HR & Management
- `can_manage_billing()` / `can_manage_users()` — admin **or** HR & Management

## Data model

```
profiles ──< profile_departments >── departments
   │                                      │
   │ created_by                           │ department_id
   ▼                                      ▼
invoices ──> invoice_categories <── misc_payments
```

- **departments** — the seven departments (seeded).
- **profile_departments** — many-to-many; a person ↔ their department(s).
- **invoice_categories** — spend categories (Software, Equipment, Freelancer,
  Marketing, etc.), used for analysis.
- **invoices** — metadata + a storage path to the PDF. Created by anyone,
  scoped to a department, cleared by billing managers (recording **who** cleared
  and **when**).
- **misc_payments** — a private ledger for one-off payments, restricted to
  billing managers.

### A note on storage and database limits

**Files never live in the database.** Invoice PDFs, payment proofs, and chat
images are stored in **object storage** (Supabase Storage buckets); the database
holds only small text rows pointing at them. This keeps the database tiny and
well within free-tier limits regardless of how many invoices accumulate.

Object storage is the part that grows. It is deliberately accessed through a
**single storage layer** in the app, so the provider can be swapped (Supabase →
Hostinger / S3-compatible storage) later as a configuration change, not a
rewrite. Chat images are compressed before upload to conserve space.

## Delivery phases

### Phase 1 — Foundation ✅ *Done*
Departments, multi-department membership, the three permission tiers, and the
billing/user-management database design (`0002_departments_and_billing.sql`).

### Phase 2 — User Management v2 ✅ *Done*
Assign employees to department(s) via multi-select; HR & Management (not just
admins) can manage staff; department badges. *(Released as 0.2.0.)*

### Phase 3 — Billing module 🟡 *In progress*
Built as three separate tools (see "The billing module" in the project README):

- **Generate** ✅ — invoice generator: form → branded PDF, **eight templates**,
  fixed Herbal Deck bill-to, auto number/date, payment-details block. Rendered
  client-side; download only.
- **Post** ✅ — record an invoice into tracking (provider, amount, department,
  reason, optional PDF upload).
- **Clear** ✅ — admins + HR & Management: department panels, status views
  (pending / cleared / rejected), search, sort; clear / reject / upload signed
  copy, with clearer tracking. *(Generate/Post/Clear released as 0.3.0.)*
- **Miscellaneous payments** ⬜ — HR & Management-only ledger *(table exists; UI
  pending)*.
- **Analytics** ⬜ — total and pending spend by category, department, and month
  *(next up)*.

### Phase 4 — Chat
Department-based group chat with file and image attachments, built on Supabase
Realtime.

### Phase 5 — Operations *(later)*
Team Lead role, task assignment, and end-of-day (EOD) reporting.

---

*This roadmap reflects product decisions owned and directed by the project
owner; it is updated as phases are delivered.*
