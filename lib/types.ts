/**
 * Shared domain types for the Herbal Deck portal.
 *
 * These types describe the shape of data that flows between Supabase and the
 * UI. They are intentionally framework-agnostic so they can be reused by both
 * server and client components.
 */

/**
 * Account-level roles. "admin" = owner-level (founder, CTO). "team_lead" is a
 * department-scoped middle tier (see decisions.md). "employee" is the default.
 */
export type Role = "admin" | "hr_management" | "team_lead" | "employee";

/**
 * A user profile row from `public.profiles`. One profile exists per
 * authenticated user (linked 1:1 to `auth.users`).
 */
export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  /** Job title / designation, e.g. "Video Editor" (optional). */
  post: string | null;
  /** Storage path of the profile picture in the `avatars` bucket (or null). */
  avatar_path: string | null;
  /** Default accent colour (hex), unique within their department. */
  color: string | null;
  /** Optional date of birth (YYYY-MM-DD) — drives the calendar birthday markers. */
  date_of_birth: string | null;
  /**
   * Default sticky-note colour key (see NOTE_COLORS), unique within their
   * department — the note background when a task of theirs has no custom colour.
   */
  note_color: string | null;
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
  /** Storage path (in the `payment-proofs` bucket) of the proof attached when cleared. */
  payment_proof_path: string | null;
  status: InvoiceStatus;
  cleared_by: string | null;
  cleared_at: string | null;
  reason: string | null;
  document: import("@/lib/invoice-pdf").InvoiceData | null;
  created_at: string;
}

/**
 * Columns actually read by the billing pages (post/clearing/analytics),
 * deliberately excluding `document` (a jsonb blob from an earlier design that
 * posting no longer writes — nothing in the UI reads it) and `description` /
 * `due_date` (unused fields on this table). Selecting this list instead of
 * `select("*")` keeps invoice queries light as the table grows, without
 * changing what any page shows.
 */
export const INVOICE_LIST_COLUMNS =
  "id, invoice_number, created_by, department_id, category_id, vendor_name, amount, currency, issue_date, file_path, payment_proof_path, status, cleared_by, cleared_at, reason, created_at";

/**
 * A one-off payment from the "Petty Cash" ledger (`public.misc_payments`) —
 * HR & Management only. Simple by design: who it was paid to, why, and how
 * much (always INR).
 */
export interface MiscPayment {
  id: string;
  created_by: string;
  category_id: string | null;
  description: string;
  paid_to: string | null;
  amount: number;
  currency: string;
  payment_date: string;
  proof_path: string | null;
  notes: string | null;
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

/** A file shared in a chat message (stored in the `chat-attachments` bucket). */
export interface MessageAttachment {
  /** Path within the bucket: "<conversation_id>/<uuid>.<ext>". */
  path: string;
  name: string;
  mime: string;
  size: number;
  kind: "image" | "document";
}

/** A message row from `public.messages`. */
export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  /** Profile ids that were @-mentioned (pinged) in the body. */
  mentions: string[];
  /** Files uploaded with the message (may be empty). */
  attachments: MessageAttachment[];
  created_at: string;
}

// --- Notifications --------------------------------------------------------

/** Kinds of notification the portal raises. */
export type NotificationType =
  | "message"
  | "mention"
  | "invoice_posted"
  | "group_added"
  | "task_assigned"
  | "task_due_soon"
  | "task_overdue"
  | "eod_reminder"
  | "eod_submitted";

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
  /** Chosen sticky-note colour key (see NOTE_COLORS); null = department colour. */
  color: string | null;
  /** When the task first entered "In Progress" (null if it never did). */
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Columns the task board/list/reporting UI actually reads. Excludes
 * `updated_at`, which nothing in the app displays — every task query selects
 * this instead of `select("*")`.
 */
export const TASK_LIST_COLUMNS =
  "id, title, description, status, created_by, assigned_to, department_id, deadline, archived, color, started_at, completed_at, created_at";

/**
 * An append-only activity row from `public.task_activity` — the task history
 * log (powers EOD). `task_id` becomes null if the task is later deleted;
 * `task_title` / `department_id` are denormalised so the row still makes sense.
 */
export interface TaskActivity {
  id: string;
  task_id: string | null;
  actor_id: string | null;
  action: "created" | "status_changed" | "assigned" | "archived";
  from_status: TaskStatus | null;
  to_status: TaskStatus | null;
  task_title: string | null;
  department_id: string | null;
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

/**
 * A passive attendance row from `public.activity_logs` — one per employee per
 * day. `eod_submitted_at` is the "clock-out" (null if they never submitted).
 */
export interface ActivityLog {
  id: string;
  employee_id: string;
  date: string;
  first_seen_at: string;
  last_seen_at: string;
  pages_visited: string[];
  actions_count: number;
  eod_submitted_at: string | null;
  /** True when they were active but never submitted an EOD by end of day. */
  incomplete: boolean;
  created_at: string;
}

/** The visibility tier of a calendar event. */
export type CalendarEventType = "personal" | "department" | "common" | "targeted";

/** An event row from `public.calendar_events`. */
export interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  event_type: CalendarEventType;
  /** YYYY-MM-DD (IST). */
  event_date: string;
  /** HH:MM[:SS] or null. */
  event_time: string | null;
  created_by: string;
  /** Department ids the event targets (for department / targeted); else null. */
  department_ids: string[] | null;
  visible_to_all: boolean;
  created_at: string;
}
