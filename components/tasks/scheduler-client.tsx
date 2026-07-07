"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon, TrashIcon, CloseIcon, ClockIcon } from "@/components/icons";
import {
  createSchedule,
  toggleSchedule,
  deleteSchedule,
} from "@/app/(dashboard)/tasks/scheduler/actions";
import type {
  ScheduleRecurrence,
  ScheduleTarget,
  TaskSchedule,
} from "@/lib/types";
import type { DeptRef, Person } from "@/components/tasks/types";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const inputClass =
  "w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring";
const labelClass = "text-xs font-medium text-muted-foreground";

const RECURRENCE_LABEL: Record<ScheduleRecurrence, string> = {
  daily: "Daily (Mon–Sat)",
  weekly: "Weekly",
  once: "Once",
  range: "Date range",
};

const TARGET_LABEL: Record<ScheduleTarget, string> = {
  person: "A person",
  department: "A department",
  everyone: "Everyone",
};

function recurrenceSummary(s: TaskSchedule): string {
  const until = s.end_date ? ` · until ${s.end_date}` : "";
  switch (s.recurrence) {
    case "daily":
      return `Every working day (Mon–Sat)${until}`;
    case "weekly": {
      const days = [...s.weekdays].sort().map((d) => WEEKDAYS[d]).join(", ");
      return `Weekly on ${days || "—"}${until}`;
    }
    case "once":
      return `Once on ${s.start_date}`;
    case "range":
      return `Working days, ${s.start_date} – ${s.end_date ?? "?"}`;
    default:
      return "";
  }
}

/**
 * Create and manage task schedules. Employees schedule for themselves; team
 * leads for their department(s); admins + HR for anyone/everyone. The available
 * target options reflect the caller's role (and the database re-checks).
 */
export function SchedulerClient({
  me,
  schedules,
  people,
  departments,
  allowedTargets,
  nameOf,
  deptNameOf,
  todayISO,
}: {
  me: string;
  schedules: TaskSchedule[];
  people: Person[];
  departments: DeptRef[];
  allowedTargets: ScheduleTarget[];
  nameOf: Record<string, string>;
  deptNameOf: Record<string, string>;
  todayISO: string;
}) {
  const router = useRouter();
  const [list, setList] = useState(schedules);
  const [showForm, setShowForm] = useState(false);

  function targetSummary(s: TaskSchedule): string {
    if (s.target_type === "everyone") return "Everyone";
    if (s.target_type === "department")
      return `${deptNameOf[s.target_department ?? ""] ?? "Department"} (department)`;
    return nameOf[s.target_person ?? ""] ?? "Someone";
  }

  async function onToggle(id: string, active: boolean) {
    setList((prev) => prev.map((s) => (s.id === id ? { ...s, active } : s)));
    await toggleSchedule(id, active);
  }

  async function onDelete(id: string) {
    setList((prev) => prev.filter((s) => s.id !== id));
    await deleteSchedule(id);
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {list.length} schedule{list.length === 1 ? "" : "s"}
        </p>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-90"
        >
          <PlusIcon className="h-4 w-4" />
          New schedule
        </button>
      </div>

      <ul className="space-y-2">
        {list.length === 0 && (
          <li className="rounded-xl border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
            No schedules yet. Create one to have tasks appear automatically.
          </li>
        )}
        {list.map((s) => (
          <li
            key={s.id}
            className="flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-card px-4 py-3"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <ClockIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <p className="truncate text-sm font-medium">{s.title}</p>
                {!s.active && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    Paused
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {recurrenceSummary(s)} · for <span className="font-medium">{targetSummary(s)}</span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void onToggle(s.id, !s.active)}
                className="rounded-lg border px-2.5 py-1.5 text-xs font-medium transition hover:bg-accent"
              >
                {s.active ? "Pause" : "Resume"}
              </button>
              <button
                type="button"
                onClick={() => void onDelete(s.id)}
                aria-label="Delete schedule"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-red-600"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>
          </li>
        ))}
      </ul>

      {showForm && (
        <ScheduleForm
          me={me}
          people={people}
          departments={departments}
          allowedTargets={allowedTargets}
          todayISO={todayISO}
          onClose={() => setShowForm(false)}
          onCreated={(s) => {
            setList((prev) => [s, ...prev]);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function ScheduleForm({
  me,
  people,
  departments,
  allowedTargets,
  todayISO,
  onClose,
  onCreated,
}: {
  me: string;
  people: Person[];
  departments: DeptRef[];
  allowedTargets: ScheduleTarget[];
  todayISO: string;
  onClose: () => void;
  onCreated: (s: TaskSchedule) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [departmentId, setDepartmentId] = useState(departments[0]?.id ?? "");
  const [targetType, setTargetType] = useState<ScheduleTarget>(allowedTargets[0] ?? "person");
  const [personId, setPersonId] = useState(
    people.some((p) => p.id === me) ? me : (people[0]?.id ?? ""),
  );
  const [targetDept, setTargetDept] = useState(departments[0]?.id ?? "");
  const [recurrence, setRecurrence] = useState<ScheduleRecurrence>("daily");
  const [weekdays, setWeekdays] = useState<Set<number>>(new Set());
  const [startDate, setStartDate] = useState(todayISO);
  const [endDate, setEndDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleWeekday(d: number) {
    setWeekdays((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  }

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await createSchedule({
      title,
      description,
      departmentId,
      targetType,
      targetPersonId: targetType === "person" ? personId : undefined,
      targetDepartmentId: targetType === "department" ? targetDept : undefined,
      recurrence,
      weekdays: recurrence === "weekly" ? [...weekdays] : undefined,
      startDate,
      endDate: endDate || undefined,
    });
    setBusy(false);
    if (res.ok && res.schedule) {
      onCreated(res.schedule);
      onClose();
    } else {
      setError(res.error ?? "Could not create the schedule.");
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <div className="relative z-10 flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-base font-semibold tracking-tight">New schedule</h2>
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
            <label className={labelClass} htmlFor="s-title">Task title</label>
            <input
              id="s-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Post daily reel, check inventory…"
              className={inputClass}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <label className={labelClass} htmlFor="s-desc">Description <span className="font-normal">(optional)</span></label>
            <textarea
              id="s-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className={`${inputClass} resize-y`}
            />
          </div>

          <div className="space-y-1.5">
            <label className={labelClass} htmlFor="s-dept">Department</label>
            <select
              id="s-dept"
              value={departmentId}
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

          {/* Target */}
          <div className="space-y-1.5">
            <label className={labelClass}>Assign to</label>
            {allowedTargets.length > 1 ? (
              <select
                value={targetType}
                onChange={(e) => setTargetType(e.target.value as ScheduleTarget)}
                className={inputClass}
              >
                {allowedTargets.map((t) => (
                  <option key={t} value={t}>
                    {TARGET_LABEL[t]}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-sm">
                {people.length === 1 && people[0].id === me ? "Yourself" : TARGET_LABEL.person}
              </p>
            )}
          </div>

          {targetType === "person" && !(people.length === 1 && people[0].id === me) && (
            <div className="space-y-1.5">
              <label className={labelClass} htmlFor="s-person">Person</label>
              <select
                id="s-person"
                value={personId}
                onChange={(e) => setPersonId(e.target.value)}
                className={inputClass}
              >
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.id === me ? `${p.name} (you)` : p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {targetType === "department" && (
            <div className="space-y-1.5">
              <label className={labelClass} htmlFor="s-tdept">Target department</label>
              <select
                id="s-tdept"
                value={targetDept}
                onChange={(e) => setTargetDept(e.target.value)}
                className={inputClass}
              >
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Recurrence */}
          <div className="space-y-1.5">
            <label className={labelClass} htmlFor="s-rec">Repeat</label>
            <select
              id="s-rec"
              value={recurrence}
              onChange={(e) => setRecurrence(e.target.value as ScheduleRecurrence)}
              className={inputClass}
            >
              {(Object.keys(RECURRENCE_LABEL) as ScheduleRecurrence[]).map((r) => (
                <option key={r} value={r}>
                  {RECURRENCE_LABEL[r]}
                </option>
              ))}
            </select>
          </div>

          {recurrence === "weekly" && (
            <div className="space-y-1.5">
              <label className={labelClass}>On days</label>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map((w, i) => {
                  const on = weekdays.has(i);
                  return (
                    <button
                      key={w}
                      type="button"
                      onClick={() => toggleWeekday(i)}
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                        on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"
                      }`}
                    >
                      {w}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className={labelClass} htmlFor="s-start">
                {recurrence === "once" ? "Date" : "Start date"}
              </label>
              <input
                id="s-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={inputClass}
              />
            </div>
            {(recurrence === "range" || recurrence === "daily" || recurrence === "weekly") && (
              <div className="space-y-1.5">
                <label className={labelClass} htmlFor="s-end">
                  {recurrence === "range" ? "End date" : "Until (optional)"}
                </label>
                <input
                  id="s-end"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className={inputClass}
                />
              </div>
            )}
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border px-3 py-2 text-sm font-medium transition hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || !title.trim()}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Creating…" : "Create schedule"}
          </button>
        </div>
      </div>
    </div>
  );
}
