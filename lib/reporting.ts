import { localDateISO } from "@/lib/time";

/**
 * Task-performance metrics for the Reporting module. Derived from the CURRENT
 * state of the `tasks` table (not the append-only activity log), so each task
 * counts once and the numbers mean something: what's done, what's open, and how
 * reliably deadlines are met.
 *
 * The caller supplies two already-RLS-scoped, already-windowed sets:
 *   - `open`      — the person's current non-archived, not-done tasks (any age),
 *   - `completed` — their tasks completed within the review window.
 * Keeping them separate is deliberate: open work should show in full regardless
 * of age, while completed work is bounded to the window so the list stays useful.
 */

/** The minimal task shape the metrics need. */
export interface TaskLite {
  id: string;
  title: string;
  status: "todo" | "in_progress" | "done";
  /** `YYYY-MM-DD` or null. */
  deadline: string | null;
  completed_at: string | null;
  started_at: string | null;
  created_at: string;
  archived: boolean;
}

export interface TaskStats {
  /** Completed within the window. */
  completed: number;
  /** Currently open (not done, not archived). */
  open: number;
  inProgress: number;
  todo: number;
  /** Open tasks whose deadline is already past. */
  overdue: number;
  /** Open tasks due today or within the next two days. */
  dueSoon: number;
  /** Open tasks with no deadline set. */
  noDeadline: number;
  /** Completed on/before their deadline. */
  metDeadline: number;
  /** Completed late, PLUS open tasks already past their deadline. */
  missedDeadline: number;
  /** metDeadline + missedDeadline — deadline-bearing tasks with a known outcome. */
  deadlineOutcomes: number;
  /** Share met on time, 0–100 (null when there are no deadline outcomes yet). */
  onTimeRate: number | null;
  /** Share missed, 0–100 (null when there are no deadline outcomes yet). */
  missRate: number | null;
  /** Mean time from start (or creation) to completion, in ms (null if none). */
  avgCompletionMs: number | null;
}

/** True if a done task landed on or before its deadline (compared as IST dates). */
export function completedOnTime(t: TaskLite, tz = "Asia/Kolkata"): boolean | null {
  if (!t.deadline || !t.completed_at) return null;
  return localDateISO(tz, new Date(t.completed_at)) <= t.deadline;
}

export function computeTaskStats(
  open: TaskLite[],
  completed: TaskLite[],
  tz = "Asia/Kolkata",
): TaskStats {
  const today = localDateISO(tz);

  let inProgress = 0;
  let todo = 0;
  let overdue = 0;
  let dueSoon = 0;
  let noDeadline = 0;
  for (const t of open) {
    if (t.status === "in_progress") inProgress++;
    else todo++;
    if (!t.deadline) {
      noDeadline++;
    } else if (t.deadline < today) {
      overdue++;
    } else if (t.deadline <= addDays(today, 2)) {
      dueSoon++;
    }
  }

  let metDeadline = 0;
  let lateDeadline = 0;
  let completionMsSum = 0;
  let completionN = 0;
  for (const t of completed) {
    const onTime = completedOnTime(t, tz);
    if (onTime === true) metDeadline++;
    else if (onTime === false) lateDeadline++;

    const from = t.started_at ?? t.created_at;
    if (from && t.completed_at) {
      const ms = Date.parse(t.completed_at) - Date.parse(from);
      if (Number.isFinite(ms) && ms >= 0) {
        completionMsSum += ms;
        completionN++;
      }
    }
  }

  // An open task already past its deadline is a definitive miss.
  const missedDeadline = lateDeadline + overdue;
  const deadlineOutcomes = metDeadline + missedDeadline;

  return {
    completed: completed.length,
    open: open.length,
    inProgress,
    todo,
    overdue,
    dueSoon,
    noDeadline,
    metDeadline,
    missedDeadline,
    deadlineOutcomes,
    onTimeRate: deadlineOutcomes ? Math.round((metDeadline / deadlineOutcomes) * 100) : null,
    missRate: deadlineOutcomes ? Math.round((missedDeadline / deadlineOutcomes) * 100) : null,
    avgCompletionMs: completionN ? Math.round(completionMsSum / completionN) : null,
  };
}

/** Add N days to a `YYYY-MM-DD` string, returning a `YYYY-MM-DD` string. */
function addDays(dateISO: string, days: number): string {
  const t = Date.parse(`${dateISO}T00:00:00Z`);
  if (Number.isNaN(t)) return dateISO;
  return new Date(t + days * 86_400_000).toISOString().slice(0, 10);
}

/** The columns the metrics need — the select list for reporting task queries. */
export const TASK_STAT_COLUMNS =
  "id, title, status, deadline, completed_at, started_at, created_at, archived, assigned_to";
