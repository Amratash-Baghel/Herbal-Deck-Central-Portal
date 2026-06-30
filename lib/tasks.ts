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
