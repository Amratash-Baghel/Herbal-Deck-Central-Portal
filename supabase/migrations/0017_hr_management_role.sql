-- ===========================================================================
-- Migration 0017 — "hr_management" account role (enum value)
-- ===========================================================================
-- Run this ONCE in the Supabase SQL Editor, AFTER migration 0016, and ON ITS
-- OWN (a new enum value must be committed before it can be used — migration
-- 0018 uses it).
--
-- HR & Management authority has always come from belonging to the HR &
-- Management department. This adds it as a directly-assignable ACCOUNT ROLE too,
-- so an admin can grant it to a person regardless of department. Both paths
-- (role OR department) grant the same permissions — see 0018.
-- ===========================================================================

alter type public.user_role add value if not exists 'hr_management';

-- ===========================================================================
-- Done. Now run 0018_task_colors_and_hr_role.sql.
-- ===========================================================================
