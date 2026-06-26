-- ===========================================================================
-- Migration 0002 — Departments, multi-department membership, and Billing
-- ===========================================================================
-- Run this ONCE in the Supabase SQL Editor, AFTER the initial schema.sql
-- (migration 0001). It is additive and safe to run on the live database — it
-- creates new tables and refines policies without dropping existing data.
--
-- Adds:
--   1. departments (the 7 Herbal Deck departments)
--   2. profile_departments — multi-department membership (a person can be in
--      more than one department)
--   3. permission helpers — is_hr_management(), can_manage_billing(),
--      can_manage_users(), my_department_ids()
--   4. invoice_categories
--   5. invoices — created by anyone, scoped to a department, cleared by HR &
--      Management (tracking WHO cleared)
--   6. misc_payments — miscellaneous payments ledger, HR & Management only
--   7. Row Level Security for all of the above
--   8. private storage buckets for files (invoices, proofs, chat attachments)
-- ===========================================================================

-- 1. Departments ------------------------------------------------------------
create table if not exists public.departments (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  slug       text not null unique,
  created_at timestamptz not null default now()
);

insert into public.departments (name, slug) values
  ('Tech',               'tech'),
  ('Creative',           'creative'),
  ('Influencer',         'influencer'),
  ('Video Editing',      'video-editing'),
  ('Graphic Designing',  'graphic-designing'),
  ('HR & Management',    'hr-management'),
  ('Ecommerce',          'ecommerce')
on conflict (slug) do nothing;

-- 2. Multi-department membership (many-to-many) -----------------------------
create table if not exists public.profile_departments (
  profile_id    uuid not null references public.profiles(id)    on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  primary key (profile_id, department_id)
);

create index if not exists profile_departments_dept_idx
  on public.profile_departments(department_id);

-- 3. Permission helpers -----------------------------------------------------
-- SECURITY DEFINER so they read membership without re-triggering RLS.

-- Is the current user a member of HR & Management?
create or replace function public.is_hr_management()
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1
    from public.profile_departments pd
    join public.departments d on d.id = pd.department_id
    where pd.profile_id = auth.uid() and d.slug = 'hr-management'
  );
$$;

-- Full authority over billing (admins + HR & Management).
create or replace function public.can_manage_billing()
returns boolean language sql security definer set search_path = public stable as $$
  select public.is_admin() or public.is_hr_management();
$$;

-- Full authority over employee management (admins + HR & Management).
create or replace function public.can_manage_users()
returns boolean language sql security definer set search_path = public stable as $$
  select public.is_admin() or public.is_hr_management();
$$;

-- Departments the current user belongs to (used for invoice visibility).
create or replace function public.my_department_ids()
returns setof uuid language sql security definer set search_path = public stable as $$
  select department_id from public.profile_departments where profile_id = auth.uid();
$$;

-- 4. Invoice categories -----------------------------------------------------
create table if not exists public.invoice_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  slug       text not null unique,
  created_at timestamptz not null default now()
);

-- Starter set — editable later from the app or here.
insert into public.invoice_categories (name, slug) values
  ('Software & Tools',        'software-tools'),
  ('Equipment & Hardware',    'equipment-hardware'),
  ('Freelancer & Contractor', 'freelancer-contractor'),
  ('Marketing & Ads',         'marketing-ads'),
  ('Office & Supplies',       'office-supplies'),
  ('Travel',                  'travel'),
  ('Other',                   'other')
on conflict (slug) do nothing;

-- 5. Invoice status ---------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'invoice_status') then
    create type public.invoice_status as enum ('pending', 'cleared', 'rejected');
  end if;
end $$;

-- 6. Invoices ---------------------------------------------------------------
-- A row stores only METADATA + a storage path to the file. The PDF itself
-- lives in object storage (bucket 'invoices'), keeping the database tiny.
create table if not exists public.invoices (
  id                 uuid primary key default gen_random_uuid(),
  invoice_number     text not null,
  created_by         uuid not null references public.profiles(id) on delete restrict,
  department_id      uuid not null references public.departments(id),
  category_id        uuid references public.invoice_categories(id),
  vendor_name        text,
  description        text,
  amount             numeric(14,2) not null default 0,
  currency           text not null default 'INR',
  issue_date         date,
  due_date           date,
  file_path          text,                       -- storage path to the PDF
  status             public.invoice_status not null default 'pending',
  cleared_by         uuid references public.profiles(id),  -- WHO cleared it
  cleared_at         timestamptz,
  payment_proof_path text,                       -- optional proof of payment
  created_at         timestamptz not null default now()
);

create index if not exists invoices_department_idx on public.invoices(department_id);
create index if not exists invoices_status_idx     on public.invoices(status);
create index if not exists invoices_created_by_idx on public.invoices(created_by);
create index if not exists invoices_category_idx   on public.invoices(category_id);

-- 7. Miscellaneous payments (HR & Management only) --------------------------
create table if not exists public.misc_payments (
  id           uuid primary key default gen_random_uuid(),
  created_by   uuid not null references public.profiles(id) on delete restrict,
  category_id  uuid references public.invoice_categories(id),
  description  text not null,
  paid_to      text,
  amount       numeric(14,2) not null default 0,
  currency     text not null default 'INR',
  payment_date date not null default current_date,
  proof_path   text,
  notes        text,
  created_at   timestamptz not null default now()
);

create index if not exists misc_payments_date_idx     on public.misc_payments(payment_date);
create index if not exists misc_payments_category_idx on public.misc_payments(category_id);

-- 8. Row Level Security -----------------------------------------------------
alter table public.departments         enable row level security;
alter table public.profile_departments enable row level security;
alter table public.invoice_categories  enable row level security;
alter table public.invoices            enable row level security;
alter table public.misc_payments       enable row level security;

-- Departments: all signed-in users can read; only admins change the list.
drop policy if exists departments_read on public.departments;
create policy departments_read on public.departments
  for select using (auth.uid() is not null);
drop policy if exists departments_write on public.departments;
create policy departments_write on public.departments
  for all using (public.is_admin()) with check (public.is_admin());

-- Categories: all signed-in users can read; billing managers can change them.
drop policy if exists categories_read on public.invoice_categories;
create policy categories_read on public.invoice_categories
  for select using (auth.uid() is not null);
drop policy if exists categories_write on public.invoice_categories;
create policy categories_write on public.invoice_categories
  for all using (public.can_manage_billing()) with check (public.can_manage_billing());

-- Membership: readable by all signed-in users (needed to resolve visibility /
-- chat groups); only admins + HR & Management can assign or remove.
drop policy if exists profdept_read on public.profile_departments;
create policy profdept_read on public.profile_departments
  for select using (auth.uid() is not null);
drop policy if exists profdept_write on public.profile_departments;
create policy profdept_write on public.profile_departments
  for all using (public.can_manage_users()) with check (public.can_manage_users());

-- Invoices:
--   insert  — any signed-in user may create/upload their own invoice
--   select  — invoices in a department you belong to, OR billing managers see all
--   update  — billing managers only (this is how clearing/rejecting happens)
--   delete  — admins, or the creator while still pending
drop policy if exists invoices_insert on public.invoices;
create policy invoices_insert on public.invoices
  for insert with check (created_by = auth.uid());

drop policy if exists invoices_select on public.invoices;
create policy invoices_select on public.invoices
  for select using (
    public.can_manage_billing()
    or department_id in (select public.my_department_ids())
  );

drop policy if exists invoices_update on public.invoices;
create policy invoices_update on public.invoices
  for update using (public.can_manage_billing()) with check (public.can_manage_billing());

drop policy if exists invoices_delete on public.invoices;
create policy invoices_delete on public.invoices
  for delete using (
    public.is_admin()
    or (created_by = auth.uid() and status = 'pending')
  );

-- Miscellaneous payments: entirely restricted to billing managers.
drop policy if exists misc_all on public.misc_payments;
create policy misc_all on public.misc_payments
  for all using (public.can_manage_billing()) with check (public.can_manage_billing());

-- 9. Extend profile access to HR & Management (not just admins) -------------
-- HR & Management now share employee-management authority with admins.
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select using (id = auth.uid() or public.can_manage_users());

drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles
  for update
  using (id = auth.uid() or public.can_manage_users())
  with check (
    public.can_manage_users()
    or (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()))
  );

drop policy if exists "profiles_insert" on public.profiles;
create policy "profiles_insert" on public.profiles
  for insert with check (public.can_manage_users());

drop policy if exists "profiles_delete" on public.profiles;
create policy "profiles_delete" on public.profiles
  for delete using (public.can_manage_users());

-- 10. Private storage buckets ----------------------------------------------
-- Files are kept private; the app serves them through signed URLs generated
-- server-side. (Can also be created via Dashboard → Storage.)
insert into storage.buckets (id, name, public) values
  ('invoices',         'invoices',         false),
  ('payment-proofs',   'payment-proofs',   false),
  ('chat-attachments', 'chat-attachments', false)
on conflict (id) do nothing;

-- ===========================================================================
-- Done. After running this, assign each employee to their department(s) from
-- the User Management page (multi-select), and make sure you + your CTO are in
-- the HR & Management department (or keep role = 'admin') so billing unlocks.
-- ===========================================================================
