"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon, TrashIcon, CloseIcon } from "@/components/icons";
import { noteColor, noteSwatch } from "@/lib/tasks";
import { formatDayShort } from "@/lib/time";
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
const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_PRESETS: { label: string; days: number[] }[] = [
  { label: "Every day", days: [0, 1, 2, 3, 4, 5, 6] },
  { label: "Mon–Sat", days: [1, 2, 3, 4, 5, 6] },
  { label: "Weekdays", days: [1, 2, 3, 4, 5] },
];
const inputClass =
  "w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring";
const labelClass = "text-xs font-medium text-muted-foreground";

const RECURRENCE_LABEL: Record<ScheduleRecurrence, string> = {
  daily: "Daily (Mon–Sat)",
  weekly: "Repeat on days…",
  once: "Once (a single date)",
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
      const sorted = [...s.weekdays].sort((a, b) => a - b);
      if (sorted.length === 7) return `Every day${until}`;
      const days = sorted.map((d) => WEEKDAYS[d]).join(", ");
      return `On ${days || "—"}${until}`;
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
 * The next day this schedule will put a task on someone's board, or null when
 * it has nothing left to fire. Mirrors the firing rules in migration 0024
 * (`daily`/`range` = Mon–Sat, `weekly` = the chosen weekdays, `once` = its one
 * date) so the answer needs no round trip. A pure function of `todayISO`, never
 * the clock, so the server and the client agree.
 */
function nextFireISO(s: TaskSchedule, todayISO: string): string | null {
  if (s.recurrence === "once") return s.start_date >= todayISO ? s.start_date : null;
  const from = s.start_date > todayISO ? s.start_date : todayISO;
  const t = Date.parse(`${from}T00:00:00Z`);
  if (Number.isNaN(t)) return null;
  // A year is enough: every recurrence above repeats at least weekly.
  for (let i = 0; i < 366; i++) {
    const d = new Date(t + i * 86_400_000);
    const iso = d.toISOString().slice(0, 10);
    if (s.end_date && iso > s.end_date) return null;
    const dow = d.getUTCDay();
    if (s.recurrence === "weekly" ? s.weekdays.includes(dow) : dow !== 0) return iso;
  }
  return null;
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
  noteColorOf,
  todayISO,
}: {
  me: string;
  schedules: TaskSchedule[];
  people: Person[];
  departments: DeptRef[];
  allowedTargets: ScheduleTarget[];
  nameOf: Record<string, string>;
  deptNameOf: Record<string, string>;
  /** Each person's note colour, so a schedule wears its owner's stripe. */
  noteColorOf: Record<string, string | null>;
  todayISO: string;
}) {
  const router = useRouter();
  const [list, setList] = useState(schedules);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  // Only "everyone" targets are offered to people who can manage users, so this
  // doubles as the manage check — the same one the row-level policy applies.
  const canManage = allowedTargets.includes("everyone");
  const canEdit = (s: TaskSchedule) => canManage || s.created_by === me;

  const active = list.filter((s) => s.active);
  const paused = list.filter((s) => !s.active);
  const firingToday = active.filter((s) => nextFireISO(s, todayISO) === todayISO).length;

  function targetSummary(s: TaskSchedule): string {
    if (s.target_type === "everyone") return "Everyone";
    if (s.target_type === "department")
      return `${deptNameOf[s.target_department ?? ""] ?? "Department"} (department)`;
    return nameOf[s.target_person ?? ""] ?? "Someone";
  }

  async function onToggle(id: string, active: boolean) {
    const before = list;
    setError(null);
    setList((prev) => prev.map((s) => (s.id === id ? { ...s, active } : s)));
    const res = await toggleSchedule(id, active);
    if (!res.ok) {
      setList(before);
      setError(res.error ?? `Could not ${active ? "resume" : "pause"} this schedule.`);
    }
  }

  async function onDelete(id: string) {
    const before = list;
    setError(null);
    setConfirmId(null);
    setList((prev) => prev.filter((s) => s.id !== id));
    const res = await deleteSchedule(id);
    if (!res.ok) {
      setList(before);
      setError(res.error ?? "Could not delete this schedule.");
    }
  }

  function Row({ s }: { s: TaskSchedule }) {
    const fires = s.active ? nextFireISO(s, todayISO) : null;
    return (
      <li
        // The owner's colour as a stripe, the same shorthand the board and the
        // team list use — whose schedule this is reads before the words do.
        style={{
          borderLeftColor: noteSwatch(
            noteColor(null, noteColorOf[s.target_person ?? ""], null),
          ),
        }}
        className={`group flex flex-wrap items-center justify-between gap-3 rounded-xl border border-l-4 bg-card px-4 py-3 ${
          s.active ? "" : "opacity-70"
        }`}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium">{s.title}</p>
            {s.recurrence === "weekly" ? (
              <span
                title={recurrenceSummary(s)}
                className="flex shrink-0 gap-0.5"
                aria-label={recurrenceSummary(s)}
              >
                {DAY_LETTERS.map((letter, i) => (
                  <span
                    key={i}
                    aria-hidden="true"
                    className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold ${
                      s.weekdays.includes(i)
                        ? "bg-primary text-primary-foreground"
                        : "bg-foreground/10 text-muted-foreground"
                    }`}
                  >
                    {letter}
                  </span>
                ))}
              </span>
            ) : (
              <span className="shrink-0 text-xs text-muted-foreground">
                {recurrenceSummary(s)}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {s.active
              ? fires === todayISO
                ? "Fires today"
                : fires
                  ? `Fires next · ${formatDayShort(fires, todayISO)}`
                  : "Finished"
              : "Paused"}{" "}
            · for <span className="font-medium">{targetSummary(s)}</span>
          </p>
        </div>
        {/* Reserved whether or not it's filled, so nothing shifts on hover. */}
        <div className="flex h-8 items-center gap-2">
          {canEdit(s) &&
            (confirmId === s.id ? (
              <>
                <button
                  type="button"
                  onClick={() => void onDelete(s.id)}
                  className="rounded-lg border border-red-500 px-2.5 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
                >
                  Delete
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmId(null)}
                  className="rounded-lg border px-2.5 py-1.5 text-xs font-medium transition hover:bg-accent"
                >
                  Cancel
                </button>
              </>
            ) : (
              <span className="flex items-center gap-2 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => void onToggle(s.id, !s.active)}
                  className="rounded-lg border px-2.5 py-1.5 text-xs font-medium transition hover:bg-accent"
                >
                  {s.active ? "Pause" : "Resume"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmId(s.id)}
                  aria-label="Delete schedule"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-red-600"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </span>
            ))}
        </div>
      </li>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {active.length} active
          {paused.length > 0 && ` · ${paused.length} paused`}
          {firingToday > 0 && ` · ${firingToday} fire today`}
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

      {error && (
        <p role="alert" className="mb-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <ul className="space-y-2">
        {list.length === 0 && (
          <li className="flex flex-col items-center gap-3 rounded-xl border bg-card px-4 py-10 text-center">
            <p className="text-sm text-muted-foreground">
              No schedules yet. Create one to have tasks appear automatically.
            </p>
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-90"
            >
              <PlusIcon className="h-4 w-4" />
              Create a schedule
            </button>
          </li>
        )}
        {active.map((s) => (
          <Row key={s.id} s={s} />
        ))}
      </ul>

      {/* Paused schedules still matter, but not enough to sit in the way. */}
      {paused.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer list-none rounded-lg px-1 py-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground">
            {paused.length} paused
          </summary>
          <ul className="mt-2 space-y-2">
            {paused.map((s) => (
              <Row key={s.id} s={s} />
            ))}
          </ul>
        </details>
      )}

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
            <div className="space-y-2">
              <label className={labelClass}>Repeat on</label>
              {/* Alarm-style day toggles (Sun … Sat) */}
              <div className="flex justify-between gap-1.5">
                {DAY_LETTERS.map((letter, i) => {
                  const on = weekdays.has(i);
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => toggleWeekday(i)}
                      aria-pressed={on}
                      title={WEEKDAYS[i]}
                      className={`flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold transition ${
                        on
                          ? "border-primary bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      {letter}
                    </button>
                  );
                })}
              </div>
              {/* Quick presets */}
              <div className="flex flex-wrap gap-1.5">
                {DAY_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setWeekdays(new Set(p.days))}
                    className="rounded-full border px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition hover:bg-accent"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                The task appears on the board every selected day.
              </p>
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
