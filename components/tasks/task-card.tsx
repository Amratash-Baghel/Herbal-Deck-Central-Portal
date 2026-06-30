"use client";

import { deptNoteColor, adjacentStatus } from "@/lib/tasks";
import { daysUntil } from "@/lib/time";
import { ChevronLeftIcon, ChevronRightIcon, CalendarIcon } from "@/components/icons";
import type { Task, TaskStatus } from "@/lib/types";

function initials(name: string): string {
  return name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

/** A small, stable tilt (deg) derived from the id so the board looks organic. */
function tiltOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return (Math.abs(h) % 5) - 2; // -2..2
}

function DeadlinePill({ deadline }: { deadline: string | null }) {
  const days = daysUntil(deadline);
  if (days === null) return null;
  let label: string;
  let tone: string;
  if (days < 0) {
    label = `${-days}d overdue`;
    tone = "text-red-700 dark:text-red-300";
  } else if (days === 0) {
    label = "Due today";
    tone = "text-amber-700 dark:text-amber-300";
  } else {
    label = `${days}d left`;
    tone = "text-muted-foreground";
  }
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${tone}`}>
      <CalendarIcon className="h-3 w-3" />
      {label}
    </span>
  );
}

/**
 * A sticky-note task card. Coloured by its department, gently tilted, and lifts
 * on hover. Editable cards can be dragged between columns, nudged with the ◀ ▶
 * controls (the mobile-friendly move), and opened for the full editor.
 */
export function TaskCard({
  task,
  creatorName,
  assigneeName,
  deptName,
  deptSlug,
  editable,
  onOpen,
  onMove,
}: {
  task: Task;
  creatorName: string;
  assigneeName: string | null;
  deptName: string;
  deptSlug: string | null;
  editable: boolean;
  onOpen: () => void;
  onMove?: (status: TaskStatus) => void;
}) {
  const prev = adjacentStatus(task.status, "prev");
  const next = adjacentStatus(task.status, "next");
  const tilt = tiltOf(task.id);

  return (
    <div
      draggable={editable}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", task.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      style={{ transform: `rotate(${tilt}deg)` }}
      className={`group rounded-xl border p-3 shadow-sm transition hover:-translate-y-0.5 hover:rotate-0 hover:shadow-md ${deptNoteColor(
        deptSlug,
      )} ${editable ? "cursor-grab active:cursor-grabbing" : ""}`}
    >
      <button
        type="button"
        onClick={onOpen}
        className="block w-full text-left text-foreground"
      >
        <p className="text-sm font-semibold leading-snug">{task.title}</p>
        {task.description && (
          <p className="mt-1 line-clamp-2 text-xs text-foreground/70">
            {task.description}
          </p>
        )}
      </button>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-foreground/80">
        {assigneeName ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium">
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-foreground/10 text-[8px] font-bold">
              {initials(assigneeName)}
            </span>
            {assigneeName}
          </span>
        ) : (
          <span className="text-[11px] italic text-foreground/50">Unassigned</span>
        )}
        <DeadlinePill deadline={task.deadline} />
      </div>

      <div className="mt-2 flex items-center justify-between border-t border-foreground/10 pt-2">
        <span className="truncate text-[10px] uppercase tracking-wide text-foreground/55">
          {deptName} · by {creatorName.split(" ")[0]}
        </span>
        {editable && onMove && (
          <span className="flex items-center gap-1">
            {prev && (
              <button
                type="button"
                onClick={() => onMove(prev)}
                aria-label="Move left"
                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-foreground/60 transition hover:bg-foreground/10 hover:text-foreground"
              >
                <ChevronLeftIcon className="h-4 w-4" />
              </button>
            )}
            {next && (
              <button
                type="button"
                onClick={() => onMove(next)}
                aria-label="Move right"
                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-foreground/60 transition hover:bg-foreground/10 hover:text-foreground"
              >
                <ChevronRightIcon className="h-4 w-4" />
              </button>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
