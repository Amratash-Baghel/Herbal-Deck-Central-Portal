"use client";

import { useState } from "react";
import { CloseIcon, TrashIcon } from "@/components/icons";
import type { UpdateTaskInput, TaskResult } from "@/app/(dashboard)/tasks/actions";
import type { Task } from "@/lib/types";
import type { Person, DeptRef } from "@/components/tasks/types";

const inputClass =
  "w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-70";
const labelClass = "text-xs font-medium text-muted-foreground";

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          <div className="space-y-1.5">
            <label className={labelClass} htmlFor="t-title">
              Title
            </label>
            <input
              id="t-title"
              value={title}
              disabled={!editable}
              onChange={(e) => setTitle(e.target.value)}
              className={inputClass}
            />
          </div>

          <div className="space-y-1.5">
            <label className={labelClass} htmlFor="t-desc">
              Description
            </label>
            <textarea
              id="t-desc"
              value={description}
              disabled={!editable}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={editable ? "Add detail…" : "—"}
              className={`${inputClass} min-h-20 resize-y`}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className={labelClass} htmlFor="t-assignee">
                Assigned to
              </label>
              <select
                id="t-assignee"
                value={assignedTo}
                disabled={!editable || !canReassign}
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
                disabled={!editable}
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
              disabled={!editable}
              onChange={(e) => setDeadline(e.target.value)}
              className={inputClass}
            />
          </div>

          <p className="text-[11px] text-muted-foreground">
            Created by {creatorName} ·{" "}
            {new Date(task.created_at).toLocaleDateString()}
          </p>

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
