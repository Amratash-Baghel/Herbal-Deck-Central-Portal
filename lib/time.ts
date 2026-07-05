/**
 * Small, dependency-free time helpers for the UI. Kept framework-agnostic so
 * both the notification list and the chat thread can share them.
 */

/** A compact relative time, e.g. "now", "5m", "3h", "2d", or a date. */
export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 45) return "now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString();
}

/** ISO timestamp for N days before now (UTC). Kept here so Server Components
 * don't call `Date.now()` directly in render. */
export function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

/**
 * A compact human duration from a raw millisecond span, e.g. "2d 4h", "3h 12m",
 * "45m", "30s". Returns null for a missing/invalid/negative span.
 */
export function formatMs(ms: number | null | undefined): string | null {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return null;
  let secs = Math.floor(ms / 1000);
  const d = Math.floor(secs / 86400);
  secs -= d * 86400;
  const h = Math.floor(secs / 3600);
  secs -= h * 3600;
  const m = Math.floor(secs / 60);
  secs -= m * 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${secs}s`;
}

/**
 * A compact human duration between two instants, e.g. "2d 4h", "3h 12m",
 * "45m", "30s". Returns null if either end is missing/invalid or negative.
 */
export function formatDuration(
  fromISO: string | null | undefined,
  toISO: string | null | undefined,
): string | null {
  if (!fromISO || !toISO) return null;
  const a = Date.parse(fromISO);
  const b = Date.parse(toISO);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null;
  return formatMs(b - a);
}

/**
 * The UTC ISO bounds of a local calendar day (default IST), so a
 * `created_at >= start AND < end` filter selects exactly that day's rows.
 */
export function dayRangeUTC(
  dateISO: string,
  tz = "Asia/Kolkata",
): { startISO: string; endISO: string } {
  // For IST (fixed +05:30, no DST) this offset is constant.
  const offset = tz === "Asia/Kolkata" ? "+05:30" : "Z";
  const start = new Date(`${dateISO}T00:00:00${offset}`);
  const end = new Date(start.getTime() + 86_400_000);
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}

/** The hour-of-day (0–23) of an instant in a given timezone (default IST). */
export function hourInTZ(iso: string, tz = "Asia/Kolkata"): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const h = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    hour12: false,
  }).format(d);
  const n = Number(h);
  return Number.isNaN(n) ? null : n % 24;
}

/** Clock time in a specific timezone, e.g. "3:42 PM" (default IST). */
export function formatClockTZ(iso: string, tz = "Asia/Kolkata"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Clock time, e.g. "3:42 PM". */
export function formatClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/**
 * Today's date as an ISO `YYYY-MM-DD` string in a given timezone (default IST,
 * Herbal Deck's working day). Used to bucket task activity / EOD by the local
 * day rather than UTC.
 */
export function localDateISO(tz = "Asia/Kolkata", date: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(date);
}

/**
 * Days until a deadline (negative if overdue), comparing calendar dates in IST.
 * Returns null for no deadline.
 */
export function daysUntil(deadlineISO: string | null, tz = "Asia/Kolkata"): number | null {
  if (!deadlineISO) return null;
  const today = localDateISO(tz);
  const a = Date.parse(`${today}T00:00:00Z`);
  const b = Date.parse(`${deadlineISO}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

/** Day label for grouping a chat thread, e.g. "Today", "Yesterday", or a date. */
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (sameDay(d, today)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}
