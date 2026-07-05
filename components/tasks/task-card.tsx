"use client";

import type { ReactNode } from "react";
import { noteColor, adjacentStatus } from "@/lib/tasks";
import { daysUntil, formatDuration, timeAgo } from "@/lib/time";
import { ChevronLeftIcon, ChevronRightIcon, CalendarIcon } from "@/components/icons";
import { PopoverMenu } from "@/components/popover-menu";
import { RichText } from "@/components/tasks/rich-text";
import type { Task, TaskStatus } from "@/lib/types";
import type { Person } from "@/components/tasks/types";

function initials(name: string): string {
  return name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

/** Initials bubble ringed with the assignee's personal colour (if any). */
function AssigneeDot({
  color,
  children,
}: {
  color?: string | null;
  children: ReactNode;
}) {
  return (
    <span
      className="flex h-4 w-4 items-center justify-center rounded-full bg-foreground/10 text-[8px] font-bold"
      style={color ? { boxShadow: `0 0 0 1.5px ${color}` } : undefined}
    >
      {children}
    </span>
  );
}

/** A small, stable tilt (deg) derived from the id so the board looks organic. */
function tiltOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return (Math.abs(h) % 5) - 2; // -2..2
}

/** Lifecycle timestamps: created date + started/completed context. */
function TaskTiming({ task }: { task: Task }) {
  const created = new Date(task.created_at).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  });
  let extra: string | null = null;
  if (task.status === "done" && task.started_at && task.completed_at) {
    const d = formatDuration(task.started_at, task.completed_at);
    if (d) extra = `Completed in ${d}`;
  } else if (task.status === "in_progress" && task.started_at) {
    extra = `Started ${timeAgo(task.started_at)}`;
  }
  return (
    <p className="mt-2 text-[10px] text-foreground/50">
      Created {created}
      {extra && ` · ${extra}`}
    </p>
  );
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
  assignable,
  assigneeColor,
  onOpen,
  onMove,
  onAssign,
}: {
  task: Task;
  creatorName: string;
  assigneeName: string | null;
  deptName: string;
  deptSlug: string | null;
  editable: boolean;
  assignable?: Person[];
  assigneeColor?: string | null;
  onOpen: () => void;
  onMove?: (status: TaskStatus) => void;
  onAssign?: (assigneeId: string | null) => void;
}) {
  const prev = adjacentStatus(task.status, "prev");
  const next = adjacentStatus(task.status, "next");
  const tilt = tiltOf(task.id);

  return (
    <div
      draggable={editable && !!onMove}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", task.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      style={{ transform: `rotate(${tilt}deg)` }}
      className={`group rounded-xl border p-3 shadow-sm transition hover:-translate-y-0.5 hover:rotate-0 hover:shadow-md ${noteColor(
        task.color,
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
          <RichText
            html={task.description}
            className="mt-1 line-clamp-2 text-xs text-foreground/70"
          />
        )}
      </button>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-foreground/80">
        {editable && onAssign && assignable ? (
          <PopoverMenu
            ariaLabel="Assign to"
            width={192}
            buttonClassName="inline-flex items-center gap-1 rounded-md border border-foreground/15 bg-foreground/5 px-1.5 py-0.5 text-[11px] font-medium transition hover:bg-foreground/10"
            button={
              <>
                <AssigneeDot color={assigneeColor}>
                  {assigneeName ? initials(assigneeName) : "+"}
                </AssigneeDot>
                {assigneeName ?? "Assign"}
              </>
            }
          >
            {(close) => (
              <div className="max-h-56 overflow-y-auto py-1">
                <button
                  type="button"
                  onClick={() => {
                    onAssign(null);
                    close();
                  }}
                  className="block w-full px-3 py-1.5 text-left text-xs text-muted-foreground transition hover:bg-accent"
                >
                  Unassigned
                </button>
                {assignable.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      onAssign(p.id);
                      close();
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition hover:bg-accent ${
                      p.id === task.assigned_to ? "font-semibold text-primary" : ""
                    }`}
                  >
                    {p.color && (
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: p.color }}
                      />
                    )}
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </PopoverMenu>
        ) : assigneeName ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium">
            <AssigneeDot color={assigneeColor}>{initials(assigneeName)}</AssigneeDot>
            {assigneeName}
          </span>
        ) : (
          <span className="text-[11px] italic text-foreground/50">Unassigned</span>
        )}
        <DeadlinePill deadline={task.deadline} />
      </div>

      <TaskTiming task={task} />

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
