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

// --- Chat -----------------------------------------------------------------

/** A conversation is either a 1:1 direct message or a named multi-person group. */
export type ConversationType = "dm" | "group";

/** A conversation row from `public.conversations`. */
export interface Conversation {
  id: string;
  type: ConversationType;
  /** Group name; null for a DM (the UI shows the other person's name instead). */
  name: string | null;
  created_by: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  created_at: string;
}

/** A participant row from `public.conversation_participants`. */
export interface ConversationParticipant {
  conversation_id: string;
  profile_id: string;
  /** Group managers can rename the group and add/remove members. */
  is_admin: boolean;
  last_read_at: string;
  joined_at: string;
}

/** A message row from `public.messages`. */
export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  /** Profile ids that were @-mentioned (pinged) in the body. */
  mentions: string[];
  created_at: string;
}

// --- Notifications --------------------------------------------------------

/** Kinds of notification the portal raises. */
export type NotificationType =
  | "message"
  | "mention"
  | "invoice_posted"
  | "group_added"
  | "task_assigned";

/** A notification row from `public.notifications` (one user's inbox item). */
export interface Notification {
  id: string;
  recipient_id: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  data: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
}

// --- Tasks & Reporting ----------------------------------------------------

/** Kanban column / lifecycle of a task. */
export type TaskStatus = "todo" | "in_progress" | "done";

/** A task row from `public.tasks` (a sticky-note card). */
export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  created_by: string;
  assigned_to: string | null;
  department_id: string;
  deadline: string | null;
  archived: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

/** An append-only activity row from `public.task_activity` (powers EOD). */
export interface TaskActivity {
  id: string;
  task_id: string;
  actor_id: string | null;
  action: "created" | "status_changed" | "assigned" | "archived";
  from_status: TaskStatus | null;
  to_status: TaskStatus | null;
  created_at: string;
}

/** The counts captured in an EOD report's auto_summary. */
export interface EodSummary {
  created: number;
  in_progress: number;
  completed: number;
  pending: number;
}

/** An end-of-day report row from `public.eod_reports`. */
export interface EodReport {
  id: string;
  employee_id: string;
  report_date: string;
  auto_summary: EodSummary;
  manual_note: string | null;
  created_at: string;
  updated_at: string;
}
