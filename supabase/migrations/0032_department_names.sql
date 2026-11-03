-- 0032 — Rename three departments and add four new ones.
--
-- Only display names change; slugs stay, so memberships, tasks, invoices,
-- note colours and the HR & Management permission checks (slug
-- 'hr-management') are untouched. Idempotent.

update public.departments set name = 'E-commerce'           where slug = 'ecommerce';
update public.departments set name = 'Influencer Marketing' where slug = 'influencer';
update public.departments set name = 'Web Developers'       where slug = 'tech';

insert into public.departments (name, slug) values
  ('Meta',           'meta'),
  ('Operations',     'operations'),
  ('Content Writer', 'content-writer'),
  ('Social Media',   'social-media')
on conflict (slug) do update set name = excluded.name;
