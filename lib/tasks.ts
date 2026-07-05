import type { TaskStatus } from "@/lib/types";

/** The three kanban columns, in order. */
export const STATUS_COLUMNS: { value: TaskStatus; label: string }[] = [
  { value: "todo", label: "To Do" },
  { value: "in_progress", label: "In Progress" },
  { value: "done", label: "Done" },
];

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
 * Pastel sticky-note classes per department, so a card is colour-coded by the
 * department it belongs to (useful when someone is in more than one). Each entry
 * carries a light + dark background and a matching border. Falls back to a
 * classic yellow sticky for anything unmapped.
 */
const DEPARTMENT_NOTE: Record<string, string> = {
  tech: "bg-sky-100 border-sky-200 dark:bg-sky-950/40 dark:border-sky-900",
  creative: "bg-violet-100 border-violet-200 dark:bg-violet-950/40 dark:border-violet-900",
  influencer: "bg-pink-100 border-pink-200 dark:bg-pink-950/40 dark:border-pink-900",
  "video-editing": "bg-amber-100 border-amber-200 dark:bg-amber-950/40 dark:border-amber-900",
  "graphic-designing": "bg-teal-100 border-teal-200 dark:bg-teal-950/40 dark:border-teal-900",
  "hr-management": "bg-indigo-100 border-indigo-200 dark:bg-indigo-950/40 dark:border-indigo-900",
  ecommerce: "bg-lime-100 border-lime-200 dark:bg-lime-950/40 dark:border-lime-900",
};

const DEFAULT_NOTE =
  "bg-yellow-100 border-yellow-200 dark:bg-yellow-950/40 dark:border-yellow-900";

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
  { key: "yellow", label: "Yellow", className: "bg-yellow-100 border-yellow-200 dark:bg-yellow-950/40 dark:border-yellow-900", swatch: "#fde047" },
  { key: "red", label: "Red", className: "bg-red-100 border-red-200 dark:bg-red-950/40 dark:border-red-900", swatch: "#fca5a5" },
  { key: "orange", label: "Orange", className: "bg-orange-100 border-orange-200 dark:bg-orange-950/40 dark:border-orange-900", swatch: "#fdba74" },
  { key: "pink", label: "Pink", className: "bg-pink-100 border-pink-200 dark:bg-pink-950/40 dark:border-pink-900", swatch: "#f9a8d4" },
  { key: "green", label: "Green", className: "bg-green-100 border-green-200 dark:bg-green-950/40 dark:border-green-900", swatch: "#86efac" },
  { key: "teal", label: "Teal", className: "bg-teal-100 border-teal-200 dark:bg-teal-950/40 dark:border-teal-900", swatch: "#5eead4" },
  { key: "sky", label: "Sky", className: "bg-sky-100 border-sky-200 dark:bg-sky-950/40 dark:border-sky-900", swatch: "#7dd3fc" },
  { key: "violet", label: "Violet", className: "bg-violet-100 border-violet-200 dark:bg-violet-950/40 dark:border-violet-900", swatch: "#c4b5fd" },
  { key: "indigo", label: "Indigo", className: "bg-indigo-100 border-indigo-200 dark:bg-indigo-950/40 dark:border-indigo-900", swatch: "#a5b4fc" },
  { key: "slate", label: "Slate", className: "bg-slate-100 border-slate-300 dark:bg-slate-800/60 dark:border-slate-700", swatch: "#cbd5e1" },
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
