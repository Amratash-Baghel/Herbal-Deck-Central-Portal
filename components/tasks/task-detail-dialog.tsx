"use client";

import { useEffect, useState } from "react";
import { CloseIcon, TrashIcon } from "@/components/icons";
import { createClient } from "@/lib/supabase/client";
import { statusLabel, NOTE_COLORS } from "@/lib/tasks";
import { formatDuration, formatClockTZ } from "@/lib/time";
import { RichTextEditor } from "@/components/tasks/rich-text-editor";
import { RichText } from "@/components/tasks/rich-text";
import type { UpdateTaskInput, TaskResult } from "@/app/(dashboard)/tasks/actions";
import type { Task, TaskActivity } from "@/lib/types";
import type { Person, DeptRef } from "@/components/tasks/types";

const inputClass =
  "w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-70";
const labelClass = "text-xs font-medium text-muted-foreground";

function fmtStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} ${formatClockTZ(iso)}`;
}

/** Created / started / completed timestamps + total time in progress. */
function TaskTimestamps({ task, creatorName }: { task: Task; creatorName: string }) {
  const timeInProgress = formatDuration(task.started_at, task.completed_at);
  return (
    <div className="rounded-xl border bg-muted/30 p-3 text-[11px] text-muted-foreground">
      <div className="grid grid-cols-2 gap-y-1">
        <span>Created</span>
        <span className="text-right text-foreground/80">{fmtStamp(task.created_at)}</span>
        <span>Started</span>
        <span className="text-right text-foreground/80">
          {task.started_at ? fmtStamp(task.started_at) : "—"}
        </span>
        <span>Completed</span>
        <span className="text-right text-foreground/80">
          {task.completed_at ? fmtStamp(task.completed_at) : "—"}
        </span>
        {timeInProgress && (
          <>
            <span>Time in progress</span>
            <span className="text-right font-medium text-primary">{timeInProgress}</span>
          </>
        )}
      </div>
      <p className="mt-2 border-t pt-2">Created by {creatorName}</p>
    </div>
  );
}

function historyLabel(a: TaskActivity): string {
  switch (a.action) {
    case "created":
      return "Created";
    case "status_changed":
      return a.from_status && a.to_status
        ? `${statusLabel(a.from_status)} → ${statusLabel(a.to_status)}`
        : a.to_status
          ? `Moved to ${statusLabel(a.to_status)}`
          : "Status changed";
    case "assigned":
      return "Reassigned";
    case "archived":
      return "Archived";
    default:
      return "Updated";
  }
}

/** The full status-change log for a task, lazily loaded (RLS-scoped). */
function TaskHistory({ taskId }: { taskId: string }) {
  const [items, setItems] = useState<TaskActivity[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from("task_activity")
      .select("*")
      .eq("task_id", taskId)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (!cancelled) setItems((data ?? []) as TaskActivity[]);
      });
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  return (
    <div>
      <p className={labelClass}>History</p>
      {items === null ? (
        <p className="mt-1.5 text-xs text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <p className="mt-1.5 text-xs text-muted-foreground">No history yet.</p>
      ) : (
        <ul className="mt-1.5 space-y-1.5">
          {items.map((a) => (
            <li key={a.id} className="flex items-baseline gap-2 text-xs">
              <span className="w-24 shrink-0 tabular-nums text-muted-foreground">
                {fmtStamp(a.created_at)}
              </span>
              <span className="text-foreground/80">{historyLabel(a)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * View / edit a task. In editable mode (your own or assigned task) the fields
 * are live and you can archive or delete; otherwise it's a read-only detail.
 */
export function TaskDetailDialog({
  task,
  editable,
  canReassign = true,
  assignable,
  departments,
  creatorName,
  canDelete,
  onClose,
  onSave,
  onArchive,
  onDelete,
}: {
  task: Task;
  editable: boolean;
  canReassign?: boolean;
  assignable: Person[];
  departments: DeptRef[];
  creatorName: string;
  canDelete: boolean;
  onClose: () => void;
  onSave: (patch: UpdateTaskInput) => Promise<TaskResult>;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [assignedTo, setAssignedTo] = useState(task.assigned_to ?? "");
  const [departmentId, setDepartmentId] = useState(task.department_id);
  const [deadline, setDeadline] = useState(task.deadline ?? "");
  const [color, setColor] = useState<string | null>(task.color ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A completed task is locked from further editing — everything except its
  // note colour, which can still be changed so the board stays organised.
  const doneLocked = editable && task.status === "done";

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await onSave({
      title,
      description,
      assignedTo: assignedTo || null,
      departmentId,
      deadline: deadline || null,
      color,
    });
    setBusy(false);
    if (res.ok) onClose();
    else setError(res.error ?? "Could not save.");
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <div className="relative z-10 flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-base font-semibold tracking-tight">
            {editable ? "Edit task" : "Task"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {doneLocked && (
            <p className="rounded-xl border border-dashed px-3 py-2 text-xs text-muted-foreground">
              This task is completed — only its note colour can still be changed.
            </p>
          )}

          <div className="space-y-1.5">
            <label className={labelClass} htmlFor="t-title">
              Title
            </label>
            <input
              id="t-title"
              value={title}
              disabled={!editable || doneLocked}
              onChange={(e) => setTitle(e.target.value)}
              className={inputClass}
            />
          </div>

          <div className="space-y-1.5">
            <label className={labelClass}>Description</label>
            {editable && !doneLocked ? (
              <RichTextEditor
                initialValue={description}
                onChange={setDescription}
                placeholder="Add detail — bold, lists, and more…"
              />
            ) : task.description ? (
              <RichText html={task.description} className="text-sm text-foreground/80" />
            ) : (
              <p className="text-sm text-muted-foreground">—</p>
            )}
          </div>

          {editable && (
            <div className="space-y-1.5">
              <label className={labelClass}>Note colour</label>
              <div className="flex flex-wrap items-center gap-3 py-1">
                <button
                  type="button"
                  onClick={() => setColor(null)}
                  title="Assignee's default colour"
                  aria-label="Default colour"
                  aria-pressed={color === null}
                  className={`flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[9px] ring-offset-2 ring-offset-card transition ${
                    color === null ? "ring-2 ring-primary" : "ring-1 ring-border"
                  }`}
                >
                  —
                </button>
                {NOTE_COLORS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setColor(c.key)}
                    title={c.label}
                    aria-label={c.label}
                    aria-pressed={color === c.key}
                    style={{ backgroundColor: c.swatch }}
                    className={`h-6 w-6 rounded-full ring-offset-2 ring-offset-card transition ${
                      color === c.key
                        ? "ring-2 ring-primary"
                        : "ring-1 ring-black/10 hover:ring-black/25"
                    }`}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className={labelClass} htmlFor="t-assignee">
                Assigned to
              </label>
              <select
                id="t-assignee"
                value={assignedTo}
                disabled={!editable || !canReassign || doneLocked}
                onChange={(e) => setAssignedTo(e.target.value)}
                className={inputClass}
              >
                <option value="">Unassigned</option>
                {assignable.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {editable && !canReassign && (
                <p className="text-[11px] text-muted-foreground">
                  Assigned — only HR/admin can change this.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <label className={labelClass} htmlFor="t-dept">
                Department
              </label>
              <select
                id="t-dept"
                value={departmentId}
                disabled={!editable || doneLocked}
                onChange={(e) => setDepartmentId(e.target.value)}
                className={inputClass}
              >
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className={labelClass} htmlFor="t-deadline">
              Deadline <span className="font-normal">(optional)</span>
            </label>
            <input
              id="t-deadline"
              type="date"
              value={deadline}
              disabled={!editable || doneLocked}
              onChange={(e) => setDeadline(e.target.value)}
              className={inputClass}
            />
          </div>

          <TaskTimestamps task={task} creatorName={creatorName} />

          <TaskHistory taskId={task.id} />

          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
        </div>

        {editable && (
          <div className="flex items-center justify-between gap-2 border-t px-5 py-3">
            <div className="flex items-center gap-2">
              {task.status === "done" && (
                <button
                  type="button"
                  onClick={onArchive}
                  className="rounded-xl border px-3 py-2 text-xs font-medium transition hover:bg-accent"
                >
                  Archive
                </button>
              )}
              {canDelete && (
                <button
                  type="button"
                  onClick={onDelete}
                  className="inline-flex items-center gap-1 rounded-xl px-2.5 py-2 text-xs font-medium text-muted-foreground transition hover:text-red-600"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                  Delete
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={save}
              disabled={busy || !title.trim()}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
