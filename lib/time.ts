/**
 * Small, dependency-free time helpers for the UI. Kept framework-agnostic so
 * both the notification list and the chat thread can share them.
 */

/**
 * Building an `Intl.DateTimeFormat` is expensive (~60 µs, far more in a
 * throttled browser) while formatting with one is ~1 µs — and the same few
 * formats are used over and over: the task board formats ~10 dates per card on
 * every render, the chat thread two per message. So every formatter is built
 * once per (locale, options) and reused. Formatters are immutable, so sharing
 * one across renders — or across requests on the server — is safe. The number
 * of distinct formats is small and fixed by the code, so the cache stays tiny.
 *
 * `toLocaleDateString(locale, options)` / `toLocaleTimeString(...)` build a
 * fresh formatter on every call too; with explicit date (or time) fields they
 * are exactly `new Intl.DateTimeFormat(locale, options).format(date)`, so hot
 * callers use this instead.
 */
const formatters = new Map<string, Intl.DateTimeFormat>();
export function dateFormat(
  locale?: string,
  options?: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const key = `${locale ?? ""}|${options ? JSON.stringify(options) : ""}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, options);
    formatters.set(key, f);
  }
  return f;
}

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
  return dateFormat().format(new Date(iso));
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

/** Minutes past midnight (0–1439) of an instant in a timezone (default IST). */
export function minutesInTZ(iso: string, tz = "Asia/Kolkata"): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parts = dateFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === "hour")?.value);
  const m = Number(parts.find((p) => p.type === "minute")?.value);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return (h % 24) * 60 + m;
}

/** The hour-of-day (0–23) of an instant in a given timezone (default IST). */
export function hourInTZ(iso: string, tz = "Asia/Kolkata"): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const h = dateFormat("en-GB", {
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
  return dateFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

/**
 * 24-hour clock in a timezone, e.g. "17:39" (default IST). Always five
 * characters, so a column of these lines up as a column.
 */
export function formatHM(iso: string, tz = "Asia/Kolkata"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return dateFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/** Clock time, e.g. "3:42 PM". */
export function formatClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return dateFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(d);
}

/**
 * Today's date as an ISO `YYYY-MM-DD` string in a given timezone (default IST,
 * Herbal Deck's working day). Used to bucket task activity / EOD by the local
 * day rather than UTC.
 */
export function localDateISO(tz = "Asia/Kolkata", date: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return dateFormat("en-CA", { timeZone: tz }).format(date);
}

/**
 * A short calendar day, e.g. "21 Sep" — with the year ("21 Sep 24") only when
 * it differs from the caller's today. Takes `todayISO` rather than reading the
 * clock, so server and client render the same string.
 */
export function formatDayShort(
  iso: string,
  todayISO: string,
  tz = "Asia/Kolkata",
): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const sameYear = localDateISO(tz, d).slice(0, 4) === todayISO.slice(0, 4);
  return dateFormat("en-GB", {
    timeZone: tz,
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "2-digit" }),
  }).format(d);
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
  return dateFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(d);
}
