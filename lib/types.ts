/**
 * Shared domain types for the Herbal Deck portal.
 *
 * These types describe the shape of data that flows between Supabase and the
 * UI. They are intentionally framework-agnostic so they can be reused by both
 * server and client components.
 */

/** The two account-level roles. Owner-level access (founder, CTO) is "admin". */
export type Role = "admin" | "employee";

/**
 * A user profile row from `public.profiles`. One profile exists per
 * authenticated user (linked 1:1 to `auth.users`).
 */
export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  created_at: string;
}

/** A department from `public.departments`. */
export interface Department {
  id: string;
  name: string;
  slug: string;
}

/** A profile together with the department(s) it belongs to. */
export interface ProfileWithDepartments extends Profile {
  departments: Department[];
}
