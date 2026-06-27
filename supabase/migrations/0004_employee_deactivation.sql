-- ===========================================================================
-- Migration 0004 — Employee deactivation (soft remove)
-- ===========================================================================
-- Run ONCE in the Supabase SQL Editor, after 0003. Additive and safe.
--
-- "Removing" an employee can't be a hard delete: invoices.created_by and
-- misc_payments.created_by are ON DELETE RESTRICT, and a cleared invoice must
-- keep the name of who raised it (the audit trail). So removal is a soft
-- deactivation: access is revoked and the record is kept, reversibly.
--
-- This column marks a profile as deactivated. The app treats a non-null value
-- as "no access" (see lib/auth.ts), and the user's auth login is banned in the
-- same action so any live session is cut off too.
-- ===========================================================================

alter table public.profiles
  add column if not exists deactivated_at timestamptz;

-- ===========================================================================
-- No policy changes needed: the existing profiles RLS already lets billing/user
-- managers update profile rows, and deactivation is performed server-side with
-- the service-role client (which also bans the auth user).
-- ===========================================================================
