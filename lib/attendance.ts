import { minutesInTZ } from "@/lib/time";

/**
 * Daywise attendance — turns the passive `activity_logs` (arrival + EOD) into a
 * per-day status for the Reporting views.
 *
 * Working week: Monday–Saturday. Sunday is the only non-working day and is never
 * flagged. Working hours are 10:00 AM–6:00 PM IST; arriving by 10:00 is on time.
 */

export const TZ = "Asia/Kolkata";
export const WORK_START_MIN = 10 * 60; // 10:00 AM — the on-time cutoff
export const WORK_END_MIN = 18 * 60; // 6:00 PM

export type AttendanceStatus =
  | "on_time"
  | "late"
  | "incomplete"
  | "absent"
  | "off" // Sunday / non-working day
  | "upcoming"; // today (in progress) or a future date

export const STATUS_META: Record<
  AttendanceStatus,
  { label: string; tone: string }
> = {
  on_time: {
    label: "On time",
    tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  },
  late: {
    label: "Late",
    tone: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  },
  incomplete: {
    label: "Incomplete",
    tone: "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300",
  },
  absent: {
    label: "Absent",
    tone: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300",
  },
  off: {
    label: "Off",
    tone: "bg-muted text-muted-foreground",
  },
  upcoming: {
    label: "—",
    tone: "bg-muted text-muted-foreground",
  },
};

/** The subset of an `activity_logs` row the attendance calc needs. */
export interface ActivityLite {
  date: string; // YYYY-MM-DD (IST)
  first_seen_at: string;
  last_seen_at: string;
  eod_submitted_at: string | null;
}

export interface AttendanceRow {
  date: string; // YYYY-MM-DD (IST)
  weekday: number; // 0 Sun … 6 Sat
  status: AttendanceStatus;
  arrival: string | null;
  departure: string | null;
  eodSubmitted: boolean;
  activeMs: number | null;
}

/** Weekday (0 Sun … 6 Sat) of a YYYY-MM-DD date, timezone-independent. */
export function weekdayOf(dateISO: string): number {
  const t = Date.parse(`${dateISO}T00:00:00Z`);
  return Number.isNaN(t) ? 0 : new Date(t).getUTCDay();
}

export function isSunday(dateISO: string): boolean {
  return weekdayOf(dateISO) === 0;
}

/** Every calendar date from start to end inclusive (YYYY-MM-DD, IST-agnostic). */
export function dateRange(startISO: string, endISO: string): string[] {
  const out: string[] = [];
  let t = Date.parse(`${startISO}T00:00:00Z`);
  const end = Date.parse(`${endISO}T00:00:00Z`);
  if (Number.isNaN(t) || Number.isNaN(end)) return out;
  while (t <= end) {
    out.push(new Date(t).toISOString().slice(0, 10));
    t += 86_400_000;
  }
  return out;
}

/**
 * The attendance status for one employee on one date.
 *   - Sunday                        → off (never a flag)
 *   - future date                   → upcoming
 *   - today, EOD not yet submitted  → upcoming (still in progress; no red flag)
 *   - past working day, no activity → absent
 *   - activity but no EOD           → incomplete
 *   - EOD submitted, arrived ≤ 10AM → on time; else late
 */
export function computeDay(
  dateISO: string,
  todayISO: string,
  log: ActivityLite | undefined,
): AttendanceRow {
  const weekday = weekdayOf(dateISO);
  const arrival = log?.first_seen_at ?? null;
  const departure = log ? (log.eod_submitted_at ?? log.last_seen_at) : null;
  const eodSubmitted = !!log?.eod_submitted_at;
  const activeMs =
    arrival && departure ? Date.parse(departure) - Date.parse(arrival) : NaN;
  const base: Omit<AttendanceRow, "status"> = {
    date: dateISO,
    weekday,
    arrival,
    departure,
    eodSubmitted,
    activeMs: Number.isFinite(activeMs) && activeMs >= 0 ? activeMs : null,
  };

  if (weekday === 0) return { ...base, status: "off" };
  if (dateISO > todayISO) return { ...base, status: "upcoming" };
  // Today is still in progress until the EOD lands — don't flag it early.
  if (dateISO === todayISO && !eodSubmitted) return { ...base, status: "upcoming" };
  if (!log) return { ...base, status: "absent" };
  if (!eodSubmitted) return { ...base, status: "incomplete" };

  const mins = minutesInTZ(arrival as string) ?? 0;
  return { ...base, status: mins <= WORK_START_MIN ? "on_time" : "late" };
}

/** Build the daywise rows for a date range from a set of activity_logs. */
export function buildAttendance(
  dates: string[],
  todayISO: string,
  logs: ActivityLite[],
): AttendanceRow[] {
  const byDate = new Map(logs.map((l) => [l.date, l]));
  return dates.map((d) => computeDay(d, todayISO, byDate.get(d)));
}

export interface AttendanceStats {
  /** Working days with a settled status (excludes off / upcoming). */
  evaluated: number;
  onTime: number;
  late: number;
  incomplete: number;
  absent: number;
  onTimePct: number | null;
  latePct: number | null;
}

export function summarize(rows: AttendanceRow[]): AttendanceStats {
  let onTime = 0;
  let late = 0;
  let incomplete = 0;
  let absent = 0;
  for (const r of rows) {
    if (r.status === "on_time") onTime++;
    else if (r.status === "late") late++;
    else if (r.status === "incomplete") incomplete++;
    else if (r.status === "absent") absent++;
  }
  const evaluated = onTime + late + incomplete + absent;
  return {
    evaluated,
    onTime,
    late,
    incomplete,
    absent,
    onTimePct: evaluated ? Math.round((onTime / evaluated) * 100) : null,
    latePct: evaluated ? Math.round((late / evaluated) * 100) : null,
  };
}

/** First and last day (YYYY-MM-DD) of a month given a Y and 0-based month. */
export function monthBounds(year: number, month: number): { start: string; end: string } {
  const start = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const endDate = new Date(Date.UTC(year, month + 1, 0));
  return { start, end: endDate.toISOString().slice(0, 10) };
}
