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
