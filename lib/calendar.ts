import type { CalendarEventType } from "@/lib/types";

/**
 * Calendar helpers — event-type styling, the month grid, birthday markers, and
 * which event types a given role may create. Visibility itself is enforced by
 * RLS (migration 0023); this file is only presentation + creation affordances.
 */

export const EVENT_TYPE_META: Record<
  CalendarEventType,
  { label: string; dot: string; badge: string }
> = {
  personal: {
    label: "Personal",
    dot: "bg-sky-500",
    badge: "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
  },
  department: {
    label: "Department",
    dot: "bg-violet-500",
    badge: "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
  },
  common: {
    label: "Office-wide",
    dot: "bg-emerald-500",
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  },
  targeted: {
    label: "Departments",
    dot: "bg-amber-500",
    badge: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  },
};

/** Which event types a viewer may create, given their capabilities. */
export function creatableEventTypes(access: {
  canManageUsers: boolean;
  isTeamLead: boolean;
}): CalendarEventType[] {
  const types: CalendarEventType[] = ["personal"];
  if (access.isTeamLead || access.canManageUsers) types.push("department");
  if (access.canManageUsers) types.push("common", "targeted");
  return types;
}

/** True when the event type needs a department selection. */
export function typeNeedsDepartments(type: CalendarEventType): boolean {
  return type === "department" || type === "targeted";
}

export interface GridDay {
  date: string; // YYYY-MM-DD
  day: number;
  inMonth: boolean;
}

/** The 6×7 month grid (Sunday-first) covering `month` of `year` (0-based). */
export function monthGrid(year: number, month: number): GridDay[] {
  const first = new Date(Date.UTC(year, month, 1));
  const startDow = first.getUTCDay(); // 0 Sun … 6 Sat
  const gridStart = Date.UTC(year, month, 1 - startDow);
  const days: GridDay[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart + i * 86_400_000);
    days.push({
      date: d.toISOString().slice(0, 10),
      day: d.getUTCDate(),
      inMonth: d.getUTCMonth() === month,
    });
  }
  return days;
}

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The `MM-DD` key of a `YYYY-MM-DD` date (for year-recurring birthdays). */
export function monthDayKey(dateISO: string): string {
  return dateISO.slice(5);
}

/** Parse a `YYYY-MM` month key into { year, month(0-based) }; falls back to now. */
export function parseMonthKey(
  key: string | undefined,
  fallbackISO: string,
): { year: number; month: number } {
  const src = key && /^\d{4}-\d{2}$/.test(key) ? key : fallbackISO.slice(0, 7);
  const [y, m] = src.split("-").map(Number);
  return { year: y, month: m - 1 };
}

/** Shift a `YYYY-MM` key by N months. */
export function shiftMonthKey(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthKeyLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Attendance dot colour for a day's status (only the flag-worthy ones). */
export function attendanceDot(status: string): string | null {
  if (status === "absent") return "bg-red-500";
  if (status === "incomplete") return "bg-orange-500";
  if (status === "late") return "bg-amber-500";
  return null;
}
