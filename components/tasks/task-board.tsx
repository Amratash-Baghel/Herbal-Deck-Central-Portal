"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { TaskCard } from "@/components/tasks/task-card";
import { TaskDetailDialog } from "@/components/tasks/task-detail-dialog";
import {
  createTask,
  moveTask,
  updateTask,
  archiveTask,
  deleteTask,
  restoreTask,
  bulkMoveTasks,
  bulkArchiveTasks,
  type UpdateTaskInput,
} from "@/app/(dashboard)/tasks/actions";
import { STATUS_COLUMNS, statusLabel, isAgedDone } from "@/lib/tasks";
import {
  PlusIcon,
  CheckIcon,
  TrashIcon,
  ChevronDownIcon,
} from "@/components/icons";
import type { Task, TaskStatus } from "@/lib/types";
import type { Person, DeptRef } from "@/components/tasks/types";

/**
 * Whether the History panel is open — a per-browser preference, read the same
 * way the theme is (an external store via useSyncExternalStore) so the server
 * and the first client render agree. localStorage is the store; `fallback`
 * stands in when storage throws (private window, blocked site data) so the
 * panel still toggles for the visit, it just isn't remembered.
 */
const HISTORY_OPEN_KEY = "hd.tasks.history-open";
const HISTORY_OPEN_EVENT = "taskhistorytoggle";

let historyOpenFallback = false;

function subscribeHistoryOpen(callback: () => void) {
  window.addEventListener(HISTORY_OPEN_EVENT, callback);
  return () => window.removeEventListener(HISTORY_OPEN_EVENT, callback);
}

function getHistoryOpen(): boolean {
  try {
    const stored = localStorage.getItem(HISTORY_OPEN_KEY);
    if (stored !== null) return stored === "1";
  } catch {
    // Storage blocked — fall through to the in-memory value.
  }
  return historyOpenFallback;
}

/** Closed on the server, so the board ships at full width before hydration. */
function getHistoryOpenOnServer(): boolean {
  return false;
}

function setHistoryOpen(open: boolean) {
  historyOpenFallback = open;
  try {
    localStorage.setItem(HISTORY_OPEN_KEY, open ? "1" : "0");
  } catch {
    // Storage blocked — the panel still opens, it just won't be remembered.
  }
  window.dispatchEvent(new Event(HISTORY_OPEN_EVENT));
}

/**
 * The blank "Write a note…" sticky at the top of To Do. It owns the draft title,
 * so typing re-renders this one note rather than the whole board — on a board
 * of a few hundred notes that was ~3,000 components per keystroke.
 */
function QuickAddNote({
  noDept,
  onOpenFull,
  onCreated,
}: {
  noDept: boolean;
  onOpenFull: () => void;
  onCreated: (task: Task) => void;
}) {
  const [quickTitle, setQuickTitle] = useState("");
  const [adding, setAdding] = useState(false);

  async function handleQuickAdd() {
    const title = quickTitle.trim();
    if (!title || adding || noDept) return;
    setAdding(true);
    const res = await createTask({ title });
    setAdding(false);
    if (res.ok && res.task) {
      onCreated(res.task as Task);
      setQuickTitle("");
    }
  }

  return (
    <div className="addnote relative mb-3 rounded-xl px-3 py-2.5">
      <button
        type="button"
        onClick={onOpenFull}
        disabled={noDept}
        aria-label="New task with full details"
        title="New task — set assignee, deadline, colour and description up front"
        className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-lg border bg-card text-muted-foreground transition hover:border-primary hover:bg-primary hover:text-primary-foreground disabled:pointer-events-none disabled:opacity-50"
      >
        <PlusIcon className="h-4 w-4" />
      </button>
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
        placeholder="Write a note…"
        className="w-full bg-transparent pr-7 text-sm font-semibold outline-none placeholder:font-medium placeholder:text-muted-foreground disabled:opacity-50"
      />
      <p className="mt-1 text-[10.5px] text-muted-foreground">
        Enter to pin it up
      </p>
    </div>
  );
}

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
  initialHistory,
  todayISO,
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
  /** Completed tasks the nightly cron archived off the board after a week. */
  initialHistory: Task[];
  /** Today in the business timezone, for deciding which notes read as aged. */
  todayISO: string;
  people: Person[];
  assignable: Person[];
  departments: DeptRef[];
  allDepartments: DeptRef[];
}) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [history, setHistory] = useState<Task[]>(initialHistory);
  const [openId, setOpenId] = useState<string | null>(null);
  /** The full create dialog, opened from the + button beside the quick-add box. */
  const [creating, setCreating] = useState(false);
  const [dragOver, setDragOver] = useState<TaskStatus | null>(null);
  const [pileOpen, setPileOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  /** History is collapsed by default, so the board keeps its full width. */
  const historyOpen = useSyncExternalStore(
    subscribeHistoryOpen,
    getHistoryOpen,
    getHistoryOpenOnServer,
  );

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

  // The committed task list, for the optimistic handlers below to roll back
  // to. Read through a ref so those handlers can keep one identity for the
  // life of the board — which is what lets every memoised card skip renders.
  const tasksRef = useRef(tasks);
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  const replaceTask = useCallback((updated: Task) => {
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  }, []);

  const handleCreated = useCallback((task: Task) => {
    setTasks((prev) => [task, ...prev]);
  }, []);

  const openCreate = useCallback(() => setCreating(true), []);

  /** Create with the full form (assignee, deadline, colour, description) in one pass. */
  async function handleCreate(patch: UpdateTaskInput) {
    const res = await createTask({
      title: patch.title ?? "",
      description: patch.description ?? undefined,
      departmentId: patch.departmentId,
      assignedTo: patch.assignedTo,
      deadline: patch.deadline,
      color: patch.color,
    });
    if (res.ok && res.task) {
      setTasks((prev) => [res.task as Task, ...prev]);
    }
    return res;
  }

  const handleMove = useCallback(
    async (taskId: string, status: TaskStatus) => {
      const before = tasksRef.current;
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status } : t)),
      );
      const res = await moveTask(taskId, status);
      if (!res.ok) setTasks(before);
      else if (res.task) replaceTask(res.task);
    },
    [replaceTask],
  );
  const moveCard = useCallback(
    (taskId: string, status: TaskStatus) => void handleMove(taskId, status),
    [handleMove],
  );

  async function handleSave(taskId: string, patch: UpdateTaskInput) {
    const res = await updateTask(taskId, patch);
    if (res.ok && res.task) replaceTask(res.task);
    return res;
  }

  const handleAssign = useCallback(
    async (taskId: string, assigneeId: string | null) => {
      const before = tasksRef.current;
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
    },
    [replaceTask],
  );
  const assignCard = useCallback(
    (taskId: string, assigneeId: string | null) => void handleAssign(taskId, assigneeId),
    [handleAssign],
  );

  async function handleArchive(taskId: string) {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    setOpenId(null);
    await archiveTask(taskId);
  }

  async function handleRestore(taskId: string, status: TaskStatus) {
    const task = history.find((t) => t.id === taskId);
    if (!task) return;
    setActionError(null);
    setHistory((prev) => prev.filter((t) => t.id !== taskId));
    const res = await restoreTask(taskId, status);
    if (res.ok && res.task) {
      setTasks((prev) => [res.task as Task, ...prev]);
    } else {
      setHistory((prev) => [task, ...prev]);
      setActionError(res.error ?? "Could not restore the task.");
    }
  }

  async function handleDelete(taskId: string) {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    setOpenId(null);
    await deleteTask(taskId);
  }

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

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

  const openTask =
    tasks.find((t) => t.id === openId) ??
    history.find((t) => t.id === openId) ??
    null;
  const openIsHistory = openTask !== null && !tasks.includes(openTask);

  // Each column's notes, newest first, with Done split into today's (fresh)
  // and the older pile. Only recomputed when the tasks themselves change.
  const columns = useMemo(
    () =>
      STATUS_COLUMNS.map((col) => {
        const items = tasks
          .filter((t) => t.status === col.value)
          .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
        // Done splits in two: today's wins stay full size, everything older
        // collapses into the pile below them.
        const piled =
          col.value === "done"
            ? items.filter((t) => isAgedDone(t, todayISO))
            : [];
        const fresh = piled.length
          ? items.filter((t) => !isAgedDone(t, todayISO))
          : items;
        return { col, items, piled, fresh };
      }),
    [tasks, todayISO],
  );

  /** One board note. Shared by the live columns and the collapsed Done pile. */
  function renderCard(task: Task) {
    const dept = deptOf(task.department_id);
    // The assignee, a manager, or someone who can assign others (team lead over
    // their dept) may move a task.
    const canMove =
      canManage ||
      canAssignOthers ||
      task.assigned_to === me.id ||
      task.assigned_to === null;
    // Reassign: managers + team leads (or an unassigned task) — but never once
    // the task is Done (its assignee is locked).
    const canReassign =
      (canAssignOthers || task.assigned_to === null) && task.status !== "done";
    return (
      <TaskCard
        key={task.id}
        task={task}
        assigneeName={nameOf(task.assigned_to)}
        deptName={dept?.name ?? "—"}
        deptSlug={dept?.slug ?? null}
        todayISO={todayISO}
        editable
        assignable={assignable}
        assigneeNoteColor={noteColorOf(task.assigned_to)}
        selectable={selectMode}
        selected={selected.has(task.id)}
        faded={isAgedDone(task, todayISO)}
        onToggleSelect={toggleSelect}
        onOpen={setOpenId}
        onMove={!selectMode && canMove ? moveCard : undefined}
        onAssign={!selectMode && canReassign ? assignCard : undefined}
      />
    );
  }

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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {columns.map(({ col, items, piled, fresh }) => {
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
              className={`col-well flex flex-col rounded-3xl border bg-muted p-3 transition ${
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

              {/* The add affordance is a blank note, pinned crooked. Typing in
                  it straightens it; Enter pins it up. The + corner opens the
                  full form for when a title alone won't do. */}
              {col.value === "todo" && (
                <QuickAddNote
                  noDept={noDept}
                  onOpenFull={openCreate}
                  onCreated={handleCreated}
                />
              )}

              <div
                className={`flex flex-col gap-3 ${piled.length ? "" : "flex-1"}`}
              >
                {fresh.map(renderCard)}
                {items.length === 0 && col.value !== "todo" && (
                  <p className="px-1 py-6 text-center text-xs text-muted-foreground">
                    Nothing here yet.
                  </p>
                )}
              </div>

              {/* Older Done work is a pile, not a list: notes overlap to a
                  title strip each, so sixteen finished tasks cost an inch of
                  column instead of a scrollbar. Collapsed, a click anywhere on
                  it fans it open rather than opening the note it landed on —
                  hence capture, before the note's own handler sees it. */}
              {piled.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => setPileOpen(!pileOpen)}
                    aria-expanded={pileOpen}
                    aria-controls="done-pile"
                    className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-2.5 text-xs font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
                  >
                    <ChevronDownIcon
                      className={`h-3.5 w-3.5 transition-transform ${
                        pileOpen ? "rotate-180" : ""
                      }`}
                    />
                    {piled.length} earlier
                  </button>
                  <div
                    id="done-pile"
                    className={`pile mt-3 ${pileOpen ? "open" : ""}`}
                    onClickCapture={(e) => {
                      if (pileOpen) return;
                      e.preventDefault();
                      e.stopPropagation();
                      setPileOpen(true);
                    }}
                  >
                    {piled.map(renderCard)}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* History — completed work the nightly job archived off the board after a
          week. Not a status, so it sits outside STATUS_COLUMNS and takes no
          drops; a note comes back only via an explicit restore. It sits under
          the board rather than in it, so collapsed it costs a strip of height
          and no width at all. */}
      <div className="mt-4">
        <h2>
          <button
            type="button"
            onClick={() => setHistoryOpen(!historyOpen)}
            aria-expanded={historyOpen}
            aria-controls="task-history-panel"
            className={`flex min-h-11 w-full items-center gap-2.5 border border-dashed bg-muted/30 px-4 py-2.5 text-left text-muted-foreground transition hover:bg-accent hover:text-foreground ${
              historyOpen
                ? "rounded-t-2xl border-b-transparent"
                : "rounded-2xl"
            }`}
          >
            <ChevronDownIcon
              className={`h-4 w-4 shrink-0 transition-transform motion-reduce:transition-none ${
                historyOpen ? "rotate-180" : ""
              }`}
            />
            <span className="text-sm font-semibold tracking-tight">History</span>
            <span className="rounded-full bg-background px-2 py-0.5 text-xs font-medium">
              {history.length}
            </span>
            <span className="ml-auto hidden text-xs sm:inline">
              Finished more than a week ago
            </span>
          </button>
        </h2>

        {/* 0fr → 1fr animates to the content's own height without measuring it.
            `inert` keeps the collapsed cards off the tab order and away from
            screen readers — they're still in the DOM, just not reachable. */}
        <div
          id="task-history-panel"
          className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${
            historyOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          }`}
        >
          <div className="min-h-0 overflow-hidden" inert={!historyOpen}>
            <div className="grid gap-3 rounded-b-2xl border border-t-0 border-dashed bg-muted/20 p-3 sm:grid-cols-2 lg:grid-cols-4">
              {history.length === 0 && (
                <p className="col-span-full px-1 py-4 text-center text-xs text-muted-foreground">
                  Tasks finished more than a week ago land here.
                </p>
              )}
              {history.map((task) => {
                const dept = deptOf(task.department_id);
                const canRestore =
                  canManage ||
                  canAssignOthers ||
                  task.assigned_to === me.id ||
                  task.assigned_to === null;
                return (
                  <div key={task.id} className="flex flex-col gap-1">
                    <TaskCard
                      task={task}
                      assigneeName={nameOf(task.assigned_to)}
                      deptName={dept?.name ?? "—"}
                      deptSlug={dept?.slug ?? null}
                      todayISO={todayISO}
                      editable={false}
                      assigneeNoteColor={noteColorOf(task.assigned_to)}
                      faded
                      onOpen={setOpenId}
                    />
                    {canRestore && (
                      <div className="flex items-center gap-1 px-1 text-[10px] text-muted-foreground">
                        <span>Restore to</span>
                        {STATUS_COLUMNS.filter((c) => c.value !== "done").map(
                          (c) => (
                            <button
                              key={c.value}
                              type="button"
                              onClick={() => void handleRestore(task.id, c.value)}
                              className="rounded-md border px-1.5 py-0.5 font-medium transition hover:bg-accent hover:text-foreground"
                            >
                              {c.label}
                            </button>
                          ),
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {openTask && (
        <TaskDetailDialog
          task={openTask}
          editable={!openIsHistory}
          canReassign={
            !openIsHistory &&
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

      {creating && (
        <TaskDetailDialog
          editable
          canReassign={canAssignOthers}
          assignable={assignable}
          departments={departments}
          creatorName={me.name}
          canDelete={false}
          meId={me.id}
          onClose={() => setCreating(false)}
          onSave={handleCreate}
        />
      )}
    </>
  );
}
