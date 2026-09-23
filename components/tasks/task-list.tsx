"use client";

import { useMemo, useState } from "react";
import { statusLabel, noteColor, noteSwatch } from "@/lib/tasks";
import { localDateISO, daysUntil } from "@/lib/time";
import { ChevronDownIcon } from "@/components/icons";
import type { Task, TaskStatus } from "@/lib/types";
import type { Person, DeptRef } from "@/components/tasks/types";

function StatusBadge({ status }: { status: TaskStatus }) {
  const tone =
    status === "done"
      ? "bg-accent text-primary"
      : status === "in_progress"
        ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
        : "bg-muted text-muted-foreground";
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}>
      {statusLabel(status)}
    </span>
  );
}

const selectClass =
  "rounded-xl border bg-background px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring";

/**
 * The exception lenses across the top. Each one is a filter, not a statistic:
 * the numbers a manager cares about are the ones they want to click through to.
 */
type Lens = "" | "overdue" | "stalled" | "unassigned" | "today" | "week";

const LENSES: { key: Exclude<Lens, "">; label: string; alarming: boolean }[] = [
  { key: "overdue", label: "Overdue", alarming: true },
  { key: "stalled", label: "Stalled 7d+", alarming: true },
  { key: "unassigned", label: "Unassigned", alarming: false },
  { key: "today", label: "Due today", alarming: false },
  { key: "week", label: "Done this week", alarming: false },
];

type GroupBy = "dept" | "person" | "flat";

const GROUPS: { key: GroupBy; label: string }[] = [
  { key: "dept", label: "Department" },
  { key: "person", label: "Person" },
  { key: "flat", label: "No grouping" },
];

const isOpen = (t: Task) => t.status !== "done";

/** Each lens as a predicate. `weekAgoISO` is derived from the caller's today. */
function lensTests(weekAgoISO: string): Record<Exclude<Lens, "">, (t: Task) => boolean> {
  const dayOf = (iso: string) => localDateISO("Asia/Kolkata", new Date(iso));
  return {
    overdue: (t) => isOpen(t) && (daysUntil(t.deadline) ?? 1) < 0,
    stalled: (t) => isOpen(t) && dayOf(t.updated_at ?? t.created_at) < weekAgoISO,
    unassigned: (t) => isOpen(t) && t.assigned_to === null,
    today: (t) => isOpen(t) && daysUntil(t.deadline) === 0,
    week: (t) => t.status === "done" && !!t.completed_at && dayOf(t.completed_at) >= weekAgoISO,
  };
}

/**
 * Sort key: the most overdue first, then by how soon it's due, then undated
 * work, and finished work last. Creation order says nothing about what needs
 * attention — a three-week-old blocker should not sit under a note from lunch.
 */
function urgency(t: Task): number {
  if (t.status === "done") return 300_000;
  const d = daysUntil(t.deadline);
  return d === null ? 200_000 : d;
}

/**
 * A read-only, filterable list of tasks — used by the department and
 * management views. Other people's tasks are visible but not editable here
 * (editing happens on the owner's board), so this is purely informational.
 *
 * It is built for someone who owns everything on screen: the exception chips
 * say what's wrong, the rollup collapses hundreds of rows into a handful of
 * departments, and the ordering surfaces the late work without being asked.
 */
export function TaskList({
  tasks,
  people,
  departments,
  todayISO,
  filters = {},
}: {
  tasks: Task[];
  people: Person[];
  departments: DeptRef[];
  todayISO: string;
  filters?: {
    person?: boolean;
    department?: boolean;
    status?: boolean;
    dateRange?: boolean;
  };
}) {
  const [person, setPerson] = useState("");
  const [dept, setDept] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [lens, setLens] = useState<Lens>("");
  const [groupBy, setGroupBy] = useState<GroupBy>("dept");

  const nameOf = useMemo(() => {
    const m = new Map(people.map((p) => [p.id, p.name]));
    return (id: string | null) => (id ? m.get(id) ?? "Someone" : null);
  }, [people]);
  const noteColorOf = useMemo(() => {
    const m = new Map(people.map((p) => [p.id, p.noteColor ?? null]));
    return (id: string | null) => (id ? m.get(id) ?? null : null);
  }, [people]);
  const deptOf = useMemo(() => {
    const m = new Map(departments.map((d) => [d.id, d]));
    return (id: string) => m.get(id);
  }, [departments]);

  // "History" isn't a status — it's the completed work the nightly cron
  // archived off the boards after a week, hidden from the other views.
  const historyView = status === "history";

  // A calendar week back from the caller's today — the boundary both "stalled"
  // and "done this week" measure against. Derived from the prop rather than
  // Date.now() so server and client agree.
  const weekAgoISO = useMemo(() => {
    const d = new Date(`${todayISO}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 7);
    return d.toISOString().slice(0, 10);
  }, [todayISO]);
  const tests = useMemo(() => lensTests(weekAgoISO), [weekAgoISO]);

  // The dropdown-filtered set. Chip counts come from here, so they stay put
  // while you click between lenses.
  const scoped = useMemo(() => {
    return tasks
      .filter((t) => (historyView ? t.archived : !t.archived))
      .filter((t) => (person ? t.assigned_to === person : true))
      .filter((t) => (dept ? t.department_id === dept : true))
      .filter((t) => (status && !historyView ? t.status === status : true))
      .filter((t) => (from ? t.created_at.slice(0, 10) >= from : true))
      .filter((t) => (to ? t.created_at.slice(0, 10) <= to : true));
  }, [tasks, person, dept, status, from, to, historyView]);

  const counts = useMemo(() => {
    const c = { overdue: 0, stalled: 0, unassigned: 0, today: 0, week: 0 };
    for (const t of scoped) {
      for (const { key } of LENSES) if (tests[key](t)) c[key]++;
    }
    return c;
  }, [scoped, tests]);

  const filtered = useMemo(() => {
    const rows = lens ? scoped.filter(tests[lens]) : scoped;
    return [...rows].sort(
      (a, b) => urgency(a) - urgency(b) || Date.parse(b.created_at) - Date.parse(a.created_at),
    );
  }, [scoped, lens, tests]);

  const groups = useMemo(() => {
    if (groupBy === "flat") return [];
    const m = new Map<string, Task[]>();
    for (const t of filtered) {
      const id = groupBy === "dept" ? t.department_id : t.assigned_to ?? "unassigned";
      const bucket = m.get(id);
      if (bucket) bucket.push(t);
      else m.set(id, [t]);
    }
    return [...m]
      .map(([id, ts]) => {
        let todo = 0;
        let doing = 0;
        let done = 0;
        let late = 0;
        for (const t of ts) {
          if (t.status === "todo") todo++;
          else if (t.status === "in_progress") doing++;
          else done++;
          if (tests.overdue(t)) late++;
        }
        return {
          id,
          label:
            groupBy === "dept"
              ? deptOf(id)?.name ?? "No department"
              : nameOf(id === "unassigned" ? null : id) ?? "Unassigned",
          tasks: ts,
          todo,
          doing,
          done,
          late,
        };
      })
      // The department that's on fire goes to the top, then the biggest load.
      .sort((a, b) => b.late - a.late || b.tasks.length - a.tasks.length);
  }, [filtered, groupBy, deptOf, nameOf, tests]);

  // Nothing to collapse, or you've asked a pointed question — show the answer.
  const autoOpen = groups.length === 1 || lens !== "";

  function renderRow(t: Task) {
    const d = deptOf(t.department_id);
    const days = daysUntil(t.deadline);
    return (
      <li
        key={t.id}
        // Ownership still reads at a glance, but as a stripe rather than a
        // full colour block — so overdue red can be the loudest thing here.
        style={{
          borderLeftColor: noteSwatch(noteColor(t.color, noteColorOf(t.assigned_to), d?.slug)),
        }}
        className={`flex items-center gap-3 rounded-lg border border-l-4 bg-background px-3 py-2 ${
          t.status === "done" ? "opacity-60" : ""
        }`}
      >
        <span className="min-w-0 flex-1 truncate text-sm text-foreground">{t.title}</span>
        {groupBy !== "person" && (
          <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
            {nameOf(t.assigned_to) ?? "Unassigned"}
          </span>
        )}
        {groupBy !== "dept" && (
          <span className="hidden shrink-0 text-xs text-muted-foreground md:block">
            {d?.name ?? "—"}
          </span>
        )}
        {days !== null && t.status !== "done" && (
          <span
            className={`shrink-0 text-xs font-medium ${
              days < 0
                ? "text-red-700 dark:text-red-300"
                : days === 0
                  ? "text-amber-700 dark:text-amber-300"
                  : "text-muted-foreground"
            }`}
          >
            {days < 0 ? `${-days}d over` : days === 0 ? "today" : `${days}d`}
          </span>
        )}
        <StatusBadge status={t.status} />
      </li>
    );
  }

  const empty = (
    <li className="rounded-xl border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
      No tasks match these filters.
    </li>
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {filters.person && (
          <select value={person} onChange={(e) => setPerson(e.target.value)} className={selectClass}>
            <option value="">Everyone</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        {filters.department && (
          <select value={dept} onChange={(e) => setDept(e.target.value)} className={selectClass}>
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        )}
        {filters.status && (
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectClass}>
            <option value="">Any status</option>
            <option value="todo">To Do</option>
            <option value="in_progress">In Progress</option>
            <option value="done">Done</option>
            <option value="history">History (archived)</option>
          </select>
        )}
        {filters.dateRange && (
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={selectClass} />
            <span>→</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={selectClass} />
          </span>
        )}
      </div>

      {/* What's wrong, and a click to see it. */}
      <div className="mb-3 flex flex-wrap gap-2">
        {LENSES.map((l) => {
          const n = counts[l.key];
          const active = lens === l.key;
          return (
            <button
              key={l.key}
              type="button"
              aria-pressed={active}
              onClick={() => setLens(active ? "" : l.key)}
              disabled={n === 0 && !active}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition disabled:opacity-40 ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : n > 0 && l.alarming
                    ? "border-red-300 bg-red-50 text-red-800 hover:bg-red-100 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300"
                    : "bg-card hover:bg-accent"
              }`}
            >
              {l.label}
              <span className="tabular-nums font-semibold">{n}</span>
            </button>
          );
        })}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>Group by</span>
        <span className="inline-flex overflow-hidden rounded-lg border">
          {GROUPS.map((g) => (
            <button
              key={g.key}
              type="button"
              aria-pressed={groupBy === g.key}
              onClick={() => setGroupBy(g.key)}
              className={`px-2.5 py-1 font-medium transition ${
                groupBy === g.key ? "bg-primary text-primary-foreground" : "bg-card hover:bg-accent"
              }`}
            >
              {g.label}
            </button>
          ))}
        </span>
        <span className="ml-auto tabular-nums">{filtered.length} shown</span>
      </div>

      {groupBy === "flat" ? (
        <ul className="space-y-1.5">
          {filtered.length === 0 ? empty : filtered.map(renderRow)}
        </ul>
      ) : (
        <div className="space-y-2">
          {groups.length === 0 && <ul>{empty}</ul>}
          {groups.map((g) => (
            <details key={g.id} open={autoOpen} className="group rounded-xl border bg-card">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
                <ChevronDownIcon className="h-4 w-4 shrink-0 -rotate-90 text-muted-foreground transition-transform group-open:rotate-0" />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                  {g.label}
                </span>
                {g.late > 0 && (
                  <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-800 dark:bg-red-950/40 dark:text-red-300">
                    {g.late} overdue
                  </span>
                )}
                {/* todo · in progress · done, at a glance */}
                <span
                  className="flex h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-muted sm:w-28"
                  aria-hidden="true"
                >
                  <span style={{ flexGrow: g.done }} className="bg-primary" />
                  <span style={{ flexGrow: g.doing }} className="bg-amber-400" />
                  <span style={{ flexGrow: g.todo }} className="bg-foreground/15" />
                </span>
                <span className="w-8 shrink-0 text-right text-sm font-semibold tabular-nums text-foreground">
                  {g.tasks.length}
                </span>
              </summary>
              <ul className="space-y-1.5 border-t px-3 py-2.5">{g.tasks.map(renderRow)}</ul>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
