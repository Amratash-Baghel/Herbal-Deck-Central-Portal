import type { CalendarEventType } from "@/lib/types";

/**
 * Calendar helpers — event-type styling, the month grid, birthday markers, and
 * which event types a given role may create. Visibility itself is enforced by
 * RLS (migration 0023); this file is only presentation + creation affordances.
 */

/**
 * Each type keeps the hue it has always had — sky, violet, green, amber — but
 * draws it from the note palette rather than Tailwind's fixed one, so the
 * calendar shifts with the theme like every other surface. `dot` is the
 * saturated foot of the note; `badge` is its pale top band, where note ink
 * stays legible in all six themes (which is why no `dark:` pair is needed).
 */
export const EVENT_TYPE_META: Record<
  CalendarEventType,
  { label: string; dot: string; badge: string }
> = {
  personal: {
    label: "Personal",
    dot: "bg-[var(--n-sky-b)]",
    badge: "bg-[var(--n-sky)] text-[var(--note-ink)]",
  },
  department: {
    label: "Department",
    dot: "bg-[var(--n-violet-b)]",
    badge: "bg-[var(--n-violet)] text-[var(--note-ink)]",
  },
  common: {
    label: "Office-wide",
    dot: "bg-[var(--n-green-b)]",
    badge: "bg-[var(--n-green)] text-[var(--note-ink)]",
  },
  targeted: {
    label: "Departments",
    dot: "bg-[var(--n-amber-b)]",
    badge: "bg-[var(--n-amber)] text-[var(--note-ink)]",
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
