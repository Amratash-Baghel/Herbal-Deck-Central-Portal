-- ===========================================================================
-- Migration 0011 — Auto-assign the invoice number when posting
-- ===========================================================================
-- Run this ONCE in the Supabase SQL Editor, AFTER migration 0010. Additive.
--
-- The invoice number is no longer entered by hand (or invented by the
-- generator). Instead the OFFICIAL number is assigned by the database the moment
-- an invoice is posted, so numbers are sequential and only spent on invoices
-- that are actually filed — not on every PDF that gets generated.
--
-- Implemented as a column DEFAULT backed by a sequence, so the number is
-- allocated atomically as the row is created; the posting action simply stops
-- providing one. Format: HD-00001, HD-00002, …
-- ===========================================================================

create sequence if not exists public.invoice_number_seq;

-- SECURITY DEFINER so the default expression can allocate the next value
-- regardless of the (anon/authenticated) role doing the insert — no per-role
-- sequence grants needed.
create or replace function public.next_invoice_number()
returns text language sql security definer set search_path = public as $$
  select 'HD-' || lpad(nextval('public.invoice_number_seq')::text, 5, '0');
$$;

alter table public.invoices
  alter column invoice_number set default public.next_invoice_number();

-- ===========================================================================
-- Done. Posting an invoice now assigns e.g. HD-00001 automatically. Existing
-- invoices keep their current numbers (different format — no collision).
-- ===========================================================================
