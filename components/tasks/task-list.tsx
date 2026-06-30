"use client";

import { useMemo, useState } from "react";
import { statusLabel, deptNoteColor } from "@/lib/tasks";
import { localDateISO, daysUntil } from "@/lib/time";
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
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}>
      {statusLabel(status)}
    </span>
  );
}

const selectClass =
  "rounded-xl border bg-background px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring";

/**
 * A read-only, filterable list of tasks with a quick summary — used by the
 * department and management views. Other people's tasks are visible but not
 * editable here (editing happens on the owner's board), so this is purely
 * informational: filter by person, department, status, and date range.
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

  const nameOf = useMemo(() => {
    const m = new Map(people.map((p) => [p.id, p.name]));
    return (id: string | null) => (id ? m.get(id) ?? "Someone" : null);
  }, [people]);
  const deptOf = useMemo(() => {
    const m = new Map(departments.map((d) => [d.id, d]));
    return (id: string) => m.get(id);
  }, [departments]);

  const filtered = useMemo(() => {
    return tasks
      .filter((t) => (person ? t.assigned_to === person : true))
      .filter((t) => (dept ? t.department_id === dept : true))
      .filter((t) => (status ? t.status === status : true))
      .filter((t) => (from ? t.created_at.slice(0, 10) >= from : true))
      .filter((t) => (to ? t.created_at.slice(0, 10) <= to : true))
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  }, [tasks, person, dept, status, from, to]);

  const summary = useMemo(() => {
    let todo = 0;
    let inProgress = 0;
    let completedToday = 0;
    for (const t of filtered) {
      if (t.status === "todo") todo++;
      else if (t.status === "in_progress") inProgress++;
      if (
        t.status === "done" &&
        t.completed_at &&
        localDateISO("Asia/Kolkata", new Date(t.completed_at)) === todayISO
      ) {
        completedToday++;
      }
    }
    return { todo, inProgress, completedToday };
  }, [filtered, todayISO]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
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

      <div className="mb-4 flex flex-wrap gap-4 rounded-xl border bg-card px-4 py-3 text-sm">
        <span><strong>{summary.todo}</strong> <span className="text-muted-foreground">to do</span></span>
        <span><strong>{summary.inProgress}</strong> <span className="text-muted-foreground">in progress</span></span>
        <span><strong>{summary.completedToday}</strong> <span className="text-muted-foreground">completed today</span></span>
      </div>

      <ul className="space-y-2">
        {filtered.length === 0 && (
          <li className="rounded-xl border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
            No tasks match these filters.
          </li>
        )}
        {filtered.map((t) => {
          const d = deptOf(t.department_id);
          const days = daysUntil(t.deadline);
          return (
            <li
              key={t.id}
              className={`flex items-start gap-3 rounded-xl border-l-4 bg-card px-4 py-3 ${deptNoteColor(d?.slug)}`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{t.title}</span>
                  <StatusBadge status={t.status} />
                </div>
                <p className="mt-1 text-xs text-foreground/70">
                  {nameOf(t.assigned_to) ?? "Unassigned"} · {d?.name ?? "—"} · by{" "}
                  {nameOf(t.created_by)}
                  {days !== null && (
                    <span className={days < 0 ? "text-red-700 dark:text-red-300" : ""}>
                      {" "}· {days < 0 ? `${-days}d overdue` : days === 0 ? "due today" : `${days}d left`}
                    </span>
                  )}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
