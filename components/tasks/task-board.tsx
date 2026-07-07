"use client";

import { useMemo, useState } from "react";
import { TaskCard } from "@/components/tasks/task-card";
import { TaskDetailDialog } from "@/components/tasks/task-detail-dialog";
import {
  createTask,
  moveTask,
  updateTask,
  archiveTask,
  deleteTask,
  bulkMoveTasks,
  bulkArchiveTasks,
  type UpdateTaskInput,
} from "@/app/(dashboard)/tasks/actions";
import { STATUS_COLUMNS, statusLabel } from "@/lib/tasks";
import { PlusIcon, CheckIcon, TrashIcon } from "@/components/icons";
import type { Task, TaskStatus } from "@/lib/types";
import type { Person, DeptRef } from "@/components/tasks/types";

/**
 * "My Board" — a personal kanban of the tasks you created or were assigned.
 * Quick-add a sticky note (type a title, hit enter), drag between columns or use
 * the ◀ ▶ controls, and open a card for the full editor. State is optimistic;
 * the server actions persist and the activity log/EOD update behind the scenes.
 */
export function TaskBoard({
  me,
  canManage,
  canAssignOthers,
  initialTasks,
  people,
  assignable,
  departments,
  allDepartments,
}: {
  me: Person;
  canManage: boolean;
  /** Can assign tasks to other people (admins/HR anyone; team leads their dept). */
  canAssignOthers: boolean;
  initialTasks: Task[];
  people: Person[];
  assignable: Person[];
  departments: DeptRef[];
  allDepartments: DeptRef[];
}) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [openId, setOpenId] = useState<string | null>(null);
  const [quickTitle, setQuickTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [dragOver, setDragOver] = useState<TaskStatus | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const nameOf = useMemo(() => {
    const m = new Map(people.map((p) => [p.id, p.name]));
    return (id: string | null) => (id ? m.get(id) ?? "Someone" : null);
  }, [people]);

  const deptOf = useMemo(() => {
    const m = new Map(allDepartments.map((d) => [d.id, d]));
    return (id: string) => m.get(id);
  }, [allDepartments]);

  const noteColorOf = useMemo(() => {
    const m = new Map(people.map((p) => [p.id, p.noteColor ?? null]));
    return (id: string | null) => (id ? m.get(id) ?? null : null);
  }, [people]);

  const noDept = departments.length === 0;

  function replaceTask(updated: Task) {
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  }

  async function handleQuickAdd() {
    const title = quickTitle.trim();
    if (!title || adding || noDept) return;
    setAdding(true);
    const res = await createTask({ title });
    setAdding(false);
    if (res.ok && res.task) {
      setTasks((prev) => [res.task as Task, ...prev]);
      setQuickTitle("");
    }
  }

  async function handleMove(taskId: string, status: TaskStatus) {
    const before = tasks;
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status } : t)),
    );
    const res = await moveTask(taskId, status);
    if (!res.ok) setTasks(before);
    else if (res.task) replaceTask(res.task);
  }

  async function handleSave(taskId: string, patch: UpdateTaskInput) {
    const res = await updateTask(taskId, patch);
    if (res.ok && res.task) replaceTask(res.task);
    return res;
  }

  async function handleAssign(taskId: string, assigneeId: string | null) {
    const before = tasks;
    setActionError(null);
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, assigned_to: assigneeId } : t)),
    );
    const res = await updateTask(taskId, { assignedTo: assigneeId });
    if (!res.ok) {
      setTasks(before);
      setActionError(res.error ?? "Could not reassign this task.");
    } else if (res.task) {
      replaceTask(res.task);
    }
  }

  async function handleArchive(taskId: string) {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    setOpenId(null);
    await archiveTask(taskId);
  }

  async function handleDelete(taskId: string) {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    setOpenId(null);
    await deleteTask(taskId);
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelect() {
    setSelectMode(false);
    setSelected(new Set());
  }

  async function handleBulkMove(status: TaskStatus) {
    const ids = [...selected];
    if (ids.length === 0 || bulkBusy) return;
    setBulkBusy(true);
    setActionError(null);
    const res = await bulkMoveTasks(ids, status);
    setBulkBusy(false);
    if (res.ok && res.tasks) {
      const map = new Map(res.tasks.map((t) => [t.id, t]));
      setTasks((prev) => prev.map((t) => map.get(t.id) ?? t));
      if (res.skipped) setActionError(`${res.skipped} task(s) couldn't be moved.`);
      exitSelect();
    } else {
      setActionError(res.error ?? "Could not move the tasks.");
    }
  }

  async function handleBulkArchive() {
    const ids = [...selected];
    if (ids.length === 0 || bulkBusy) return;
    setBulkBusy(true);
    setActionError(null);
    const res = await bulkArchiveTasks(ids);
    setBulkBusy(false);
    if (res.ok) {
      setTasks((prev) => prev.filter((t) => !selected.has(t.id)));
      if (res.skipped) setActionError(`${res.skipped} task(s) couldn't be archived.`);
      exitSelect();
    } else {
      setActionError(res.error ?? "Could not archive the tasks.");
    }
  }

  const openTask = tasks.find((t) => t.id === openId) ?? null;

  return (
    <>
      {noDept && (
        <p className="mb-4 rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
          You&apos;re not in a department yet — ask an admin to add you before
          creating tasks.
        </p>
      )}

      {actionError && (
        <p
          role="alert"
          className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
        >
          {actionError}
        </p>
      )}

      {/* Multi-select toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {!selectMode ? (
          <button
            type="button"
            onClick={() => setSelectMode(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition hover:bg-accent"
          >
            <CheckIcon className="h-4 w-4" />
            Select
          </button>
        ) : (
          <>
            <span className="text-sm font-medium">{selected.size} selected</span>
            {STATUS_COLUMNS.map((col) => (
              <button
                key={col.value}
                type="button"
                disabled={selected.size === 0 || bulkBusy}
                onClick={() => void handleBulkMove(col.value)}
                className="rounded-lg border px-2.5 py-1.5 text-xs font-medium transition hover:bg-accent disabled:opacity-40"
              >
                Move to {statusLabel(col.value)}
              </button>
            ))}
            <button
              type="button"
              disabled={selected.size === 0 || bulkBusy}
              onClick={() => void handleBulkArchive()}
              className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition hover:bg-accent disabled:opacity-40"
            >
              <TrashIcon className="h-3.5 w-3.5" />
              Archive
            </button>
            <button
              type="button"
              onClick={exitSelect}
              className="ml-auto rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm transition hover:opacity-90"
            >
              Done
            </button>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {STATUS_COLUMNS.map((col) => {
          const items = tasks
            .filter((t) => t.status === col.value)
            .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
          return (
            <div
              key={col.value}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(col.value);
              }}
              onDragLeave={() => setDragOver((c) => (c === col.value ? null : c))}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(null);
                const id = e.dataTransfer.getData("text/plain");
                if (id) void handleMove(id, col.value);
              }}
              className={`flex flex-col rounded-2xl border bg-muted/30 p-3 transition ${
                dragOver === col.value ? "ring-2 ring-primary" : ""
              }`}
            >
              <div className="mb-3 flex items-center justify-between px-1">
                <h2 className="text-sm font-semibold tracking-tight">
                  {col.label}
                </h2>
                <span className="rounded-full bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {items.length}
                </span>
              </div>

              {col.value === "todo" && (
                <div className="mb-3 flex items-center gap-2 rounded-xl border bg-background px-2 py-1.5">
                  <PlusIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <input
                    value={quickTitle}
                    onChange={(e) => setQuickTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void handleQuickAdd();
                      }
                    }}
                    disabled={noDept}
                    placeholder="Add a task…"
                    className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50"
                  />
                </div>
              )}

              <div className="flex flex-1 flex-col gap-3">
                {items.map((task) => {
                  const dept = deptOf(task.department_id);
                  // The assignee, a manager, or someone who can assign others
                  // (team lead over their dept) may move a task.
                  const canMove =
                    canManage ||
                    canAssignOthers ||
                    task.assigned_to === me.id ||
                    task.assigned_to === null;
                  // Reassign: managers + team leads (or an unassigned task) — but
                  // never once the task is Done (its assignee is locked).
                  const canReassign =
                    (canAssignOthers || task.assigned_to === null) &&
                    task.status !== "done";
                  return (
                    <TaskCard
                      key={task.id}
                      task={task}
                      creatorName={nameOf(task.created_by) ?? "Someone"}
                      assigneeName={nameOf(task.assigned_to)}
                      deptName={dept?.name ?? "—"}
                      deptSlug={dept?.slug ?? null}
                      editable
                      assignable={assignable}
                      assigneeNoteColor={noteColorOf(task.assigned_to)}
                      selectable={selectMode}
                      selected={selected.has(task.id)}
                      onToggleSelect={() => toggleSelect(task.id)}
                      onOpen={() => setOpenId(task.id)}
                      onMove={
                        !selectMode && canMove
                          ? (s) => void handleMove(task.id, s)
                          : undefined
                      }
                      onAssign={
                        !selectMode && canReassign
                          ? (id) => void handleAssign(task.id, id)
                          : undefined
                      }
                    />
                  );
                })}
                {items.length === 0 && col.value !== "todo" && (
                  <p className="px-1 py-6 text-center text-xs text-muted-foreground">
                    Nothing here yet.
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {openTask && (
        <TaskDetailDialog
          task={openTask}
          editable
          canReassign={
            (canAssignOthers || openTask.assigned_to === null) &&
            openTask.status !== "done"
          }
          assignable={assignable}
          departments={departments}
          creatorName={nameOf(openTask.created_by) ?? "Someone"}
          canDelete={openTask.created_by === me.id}
          onClose={() => setOpenId(null)}
          onSave={(patch) => handleSave(openTask.id, patch)}
          onArchive={() => void handleArchive(openTask.id)}
          onDelete={() => void handleDelete(openTask.id)}
        />
      )}
    </>
  );
}
