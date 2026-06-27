-- ===========================================================================
-- Migration 0003 — Invoice posting (generator → expense tracking)
-- ===========================================================================
-- Run ONCE in the Supabase SQL Editor, after 0002. Additive and safe to run on
-- the live database.
--
-- The invoice generator lets an employee raise an invoice on behalf of a
-- service provider and download a branded PDF. "Posting" that invoice records
-- it for expense tracking, on the existing public.invoices table:
--
--   vendor_name  -> the service provider being paid
--   created_by   -> the employee who posted it (auto)
--   department_id-> the employee's department (auto / chosen)
--   amount       -> the invoice total
--   status       -> pending -> cleared / rejected (by management)
--   cleared_by   -> WHO cleared/rejected it
--   file_path    -> the signed PDF, uploaded back after the owner signs
--
-- This migration adds the two things that table was missing:
--   reason   -> why the invoice was posted (entered at post time)
--   document -> the full generator payload (parties, line items, tax, notes)
--               so the exact PDF can be re-downloaded from the record later.
-- ===========================================================================

alter table public.invoices
  add column if not exists reason   text,
  add column if not exists document jsonb;

-- ===========================================================================
-- Done. No new policies needed — the existing invoices RLS already covers it:
--   insert  -> any signed-in user, for their own rows (created_by = auth.uid())
--   select  -> your department's invoices, or all if you manage billing
--   update  -> billing managers only (this is how clearing/rejecting happens)
--   delete  -> admins, or the creator while the invoice is still pending
-- Signed-PDF uploads to the 'invoices' storage bucket are performed server-side
-- with the service-role client, so no storage policies are required either.
-- ===========================================================================
