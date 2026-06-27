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
  /** Set when the employee has been deactivated (soft-removed); null if active. */
  deactivated_at: string | null;
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

/** Lifecycle of a posted (payable) invoice. */
export type InvoiceStatus = "pending" | "cleared" | "rejected";

/** An expense-tracking category from `public.invoice_categories`. */
export interface InvoiceCategory {
  id: string;
  name: string;
  slug: string;
}

/**
 * A posted invoice row from `public.invoices`. Raised by an employee on behalf
 * of a service provider, signed by the owner (offline), then cleared by
 * management. `document` holds the full generator payload so the branded PDF
 * can be re-downloaded from the record at any time.
 */
export interface Invoice {
  id: string;
  invoice_number: string;
  created_by: string;
  department_id: string;
  category_id: string | null;
  vendor_name: string | null;
  description: string | null;
  amount: number;
  currency: string;
  issue_date: string | null;
  due_date: string | null;
  file_path: string | null;
  status: InvoiceStatus;
  cleared_by: string | null;
  cleared_at: string | null;
  reason: string | null;
  document: import("@/lib/invoice-pdf").InvoiceData | null;
  created_at: string;
}
