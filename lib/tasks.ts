import { localDateISO } from "@/lib/time";
import type { TaskStatus } from "@/lib/types";

/** The three kanban columns, in order. */
export const STATUS_COLUMNS: { value: TaskStatus; label: string }[] = [
  { value: "todo", label: "To Do" },
  { value: "in_progress", label: "In Progress" },
  { value: "done", label: "Done" },
];

/**
 * True once the day a task was completed has passed, so yesterday's finished
 * work recedes behind today's. Deliberately a calendar-day boundary rather than
 * a rolling 24 hours: two notes finished the same day should always look alike.
 */
export function isAgedDone(
  task: { status: TaskStatus; completed_at: string | null },
  todayISO: string,
): boolean {
  if (task.status !== "done" || !task.completed_at) return false;
  return localDateISO("Asia/Kolkata", new Date(task.completed_at)) < todayISO;
}

export function statusLabel(status: TaskStatus): string {
  return STATUS_COLUMNS.find((c) => c.value === status)?.label ?? status;
}

/** The next / previous column for the ◀ ▶ move controls (null at the ends). */
export function adjacentStatus(
  status: TaskStatus,
  dir: "next" | "prev",
): TaskStatus | null {
  const i = STATUS_COLUMNS.findIndex((c) => c.value === status);
  const j = dir === "next" ? i + 1 : i - 1;
  return STATUS_COLUMNS[j]?.value ?? null;
}

/**
 * Sticky-note class per department, so a card is colour-coded by the department
 * it belongs to (useful when someone is in more than one). The `note-*` classes
 * live in app/globals.css and carry both themes' colours, so the palette is
 * defined in exactly one place. Falls back to a classic yellow sticky.
 */
const DEPARTMENT_NOTE: Record<string, string> = {
  tech: "note-sky",
  creative: "note-violet",
  influencer: "note-pink",
  "video-editing": "note-amber",
  "graphic-designing": "note-teal",
  "hr-management": "note-indigo",
  ecommerce: "note-lime",
};

const DEFAULT_NOTE = "note-yellow";

export function deptNoteColor(slug?: string | null): string {
  return (slug && DEPARTMENT_NOTE[slug]) || DEFAULT_NOTE;
}

/**
 * The palette a task creator can pick for a sticky note's background — also the
 * pool of per-employee default colours. Stored as the `key` on `tasks.color`
 * (and `profiles.note_color`); the classes render the same everywhere the task
 * is shown. A null/unknown key falls back to the assignee's / department colour.
 *
 * Ten visually distinct hues — one red, no near-duplicate yellows.
 */
export const NOTE_COLORS: { key: string; label: string; className: string; swatch: string }[] = [
  { key: "yellow", label: "Yellow", className: "note-yellow", swatch: "var(--n-yellow-b)" },
  { key: "red", label: "Red", className: "note-red", swatch: "var(--n-red-b)" },
  { key: "orange", label: "Orange", className: "note-orange", swatch: "var(--n-orange-b)" },
  { key: "pink", label: "Pink", className: "note-pink", swatch: "var(--n-pink-b)" },
  { key: "green", label: "Green", className: "note-green", swatch: "var(--n-green-b)" },
  { key: "teal", label: "Teal", className: "note-teal", swatch: "var(--n-teal-b)" },
  { key: "sky", label: "Sky", className: "note-sky", swatch: "var(--n-sky-b)" },
  { key: "violet", label: "Violet", className: "note-violet", swatch: "var(--n-violet-b)" },
  { key: "indigo", label: "Indigo", className: "note-indigo", swatch: "var(--n-indigo-b)" },
  { key: "slate", label: "Slate", className: "note-slate", swatch: "var(--n-slate-b)" },
];

/** The colour keys in order — the pool employees' default colours cycle through. */
export const NOTE_COLOR_KEYS: string[] = NOTE_COLORS.map((c) => c.key);

const NOTE_COLOR_BY_KEY = new Map(NOTE_COLORS.map((c) => [c.key, c.className]));

/**
 * The note's background classes, in priority order:
 *   1. the manually-chosen colour (shown to everyone), else
 *   2. the assignee's default note colour (unique within their department), else
 *   3. the department colour (e.g. for an unassigned note).
 */
export function noteColor(
  colorKey?: string | null,
  assigneeColorKey?: string | null,
  slug?: string | null,
): string {
  return (
    (colorKey && NOTE_COLOR_BY_KEY.get(colorKey)) ||
    (assigneeColorKey && NOTE_COLOR_BY_KEY.get(assigneeColorKey)) ||
    deptNoteColor(slug)
  );
}
