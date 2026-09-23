"use client";

import { useState, type ReactNode } from "react";
import { noteColor, noteSwatch, deptNoteColor, adjacentStatus } from "@/lib/tasks";
import { daysUntil, formatDayShort, formatHM, localDateISO } from "@/lib/time";
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

/** A small initials bubble for the assignee (whose-task identity is carried by
 *  the note's background colour, not a coloured dot). */
function AssigneeDot({ children }: { children: ReactNode }) {
  return (
    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-foreground/10 text-[8px] font-bold">
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
 * A sticky-note task card. Tilted, lifts on hover, and carries its state
 * physically: a pin while it's in hand, a red dog-ear when it's overdue, and
 * the department as a corner tag rather than a footer row. Editable cards drag
 * between columns, nudge with the ◀ ▶ controls, and open the full editor —
 * where the creator and the lifecycle timestamps live.
 */
export function TaskCard({
  task,
  assigneeName,
  deptName,
  deptSlug,
  todayISO,
  editable,
  assignable,
  assigneeNoteColor,
  selectable = false,
  selected = false,
  faded = false,
  onToggleSelect,
  onOpen,
  onMove,
  onAssign,
}: {
  task: Task;
  assigneeName: string | null;
  deptName: string;
  deptSlug: string | null;
  /** Today in the business timezone — so the date stamp renders the same on
   *  the server and the client instead of reading the clock twice. */
  todayISO: string;
  editable: boolean;
  assignable?: Person[];
  /** The assignee's default note-colour key — the note's fallback background. */
  assigneeNoteColor?: string | null;
  /** When true, the card is in multi-select mode: clicking toggles selection. */
  selectable?: boolean;
  selected?: boolean;
  /** Completed on an earlier day — dimmed so it recedes behind live work. */
  faded?: boolean;
  onToggleSelect?: () => void;
  onOpen: () => void;
  onMove?: (status: TaskStatus) => void;
  onAssign?: (assigneeId: string | null) => void;
}) {
  const prev = adjacentStatus(task.status, "prev");
  const next = adjacentStatus(task.status, "next");
  const tilt = tiltOf(task.id);
  const days = daysUntil(task.deadline);
  // The corner stamp: when it was written, or — once finished — when it was
  // finished. Today's work shows the time, older work the day.
  const stampISO =
    task.status === "done" ? task.completed_at ?? task.created_at : task.created_at;
  const stamp = `${task.status === "done" ? "✓ " : ""}${
    localDateISO("Asia/Kolkata", new Date(stampISO)) === todayISO
      ? formatHM(stampISO)
      : formatDayShort(stampISO, todayISO)
  }`;
  const [dragging, setDragging] = useState(false);
  // Set on drag end so the note bounces as it settles; cleared by the animation.
  const [settling, setSettling] = useState(false);

  return (
    <div
      draggable={editable && !!onMove && !selectable}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", task.id);
        e.dataTransfer.effectAllowed = "move";
        setDragging(true);
      }}
      onDragEnd={() => {
        setDragging(false);
        setSettling(true);
      }}
      onAnimationEnd={() => setSettling(false)}
      style={{ transform: `rotate(${tilt}deg)` }}
      className={`group note border p-3 ${noteColor(
        task.color,
        assigneeNoteColor,
        deptSlug,
      )} ${dragging ? "is-dragging" : ""} ${settling ? "note-settle" : ""} ${
        editable && !selectable ? "cursor-grab active:cursor-grabbing" : ""
      } ${selected ? "ring-2 ring-primary" : ""} ${
        faded ? "opacity-70 saturate-50 hover:opacity-100 hover:saturate-100" : ""
      }`}
    >
      {/* Department: a corner tag instead of a whole footer line. */}
      <span
        className="note-tag"
        style={{ background: noteSwatch(deptNoteColor(deptSlug)) }}
        aria-hidden="true"
      />
      <span className="note-tagname">{deptName}</span>
      {task.status === "in_progress" && <span className="note-pin" aria-hidden="true" />}
      {days !== null && days < 0 && <span className="note-dogear" aria-hidden="true" />}

      {selectable && (
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          aria-label={`Select ${task.title}`}
          className="absolute left-2 top-2 h-4 w-4 accent-primary"
        />
      )}
      <button
        type="button"
        onClick={selectable ? onToggleSelect : onOpen}
        className={`block w-full text-left text-foreground ${selectable ? "pl-6" : ""}`}
      >
        <p className="text-sm font-semibold leading-snug">{task.title}</p>
        {task.description && (
          <RichText
            html={task.description}
            className="note-desc mt-1 line-clamp-2 text-xs text-foreground/70"
          />
        )}
      </button>

      {/* One meta line. The nudges float over its right end, so leave room. */}
      <div
        className={`note-meta mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-foreground/80 ${
          editable && onMove ? "pr-11" : ""
        }`}
      >
        {editable && onAssign && assignable ? (
          <PopoverMenu
            ariaLabel="Assign to"
            width={192}
            buttonClassName="inline-flex items-center gap-1 rounded-md border border-foreground/15 bg-foreground/5 px-1.5 py-0.5 text-[11px] font-medium transition hover:bg-foreground/10"
            button={
              <>
                <AssigneeDot>
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
                    className={`block w-full px-3 py-1.5 text-left text-xs transition hover:bg-accent ${
                      p.id === task.assigned_to ? "font-semibold text-primary" : ""
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </PopoverMenu>
        ) : assigneeName ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium">
            <AssigneeDot>{initials(assigneeName)}</AssigneeDot>
            {assigneeName}
          </span>
        ) : (
          <span className="text-[11px] italic text-foreground/50">Unassigned</span>
        )}
        <DeadlinePill deadline={task.deadline} />
      </div>

      <span
        title={`Created ${formatDayShort(task.created_at, todayISO)}, ${formatHM(task.created_at)}${
          task.completed_at
            ? ` · Done ${formatDayShort(task.completed_at, todayISO)}, ${formatHM(task.completed_at)}`
            : ""
        }`}
        className={`pointer-events-none absolute bottom-1.5 text-[10px] tabular-nums text-foreground/45 ${
          days !== null && days < 0 ? "right-7" : "right-2"
        } ${editable && onMove ? "transition-opacity group-hover:opacity-0" : ""}`}
      >
        {stamp}
      </span>

      {editable && onMove && (
        <span className="note-nudge absolute bottom-1.5 right-1.5 flex gap-0.5">
          {prev && (
            <button
              type="button"
              onClick={() => onMove(prev)}
              aria-label="Move left"
              className="inline-flex h-[21px] w-[21px] items-center justify-center rounded-md bg-foreground/10 transition hover:brightness-90"
            >
              <ChevronLeftIcon className="h-3.5 w-3.5" />
            </button>
          )}
          {next && (
            <button
              type="button"
              onClick={() => onMove(next)}
              aria-label="Move right"
              className="inline-flex h-[21px] w-[21px] items-center justify-center rounded-md bg-foreground/10 transition hover:brightness-90"
            >
              <ChevronRightIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </span>
      )}
    </div>
  );
}
