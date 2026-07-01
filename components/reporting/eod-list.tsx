"use client";

import { useMemo, useState } from "react";
import { EodReportCard } from "@/components/reporting/eod-report-card";
import type { DeptRef } from "@/components/tasks/types";
import type { EodReport } from "@/lib/types";

export interface EodListPerson {
  id: string;
  name: string;
  departmentIds: string[];
}

/**
 * Filterable list of submitted EOD reports (by employee, department, and date
 * range). Each row expands to the full report + that day's task timeline.
 * Filters run client-side over the RLS-scoped rows the server already returned.
 */
export function EodList({
  reports,
  people,
  departments,
  initialEmployee = "",
  initialDate = "",
}: {
  reports: EodReport[];
  people: EodListPerson[];
  departments: DeptRef[];
  initialEmployee?: string;
  initialDate?: string;
}) {
  const [employee, setEmployee] = useState(initialEmployee);
  const [dept, setDept] = useState("");
  const [from, setFrom] = useState(initialDate);
  const [to, setTo] = useState(initialDate);

  const nameOf = useMemo(() => {
    const m = new Map(people.map((p) => [p.id, p.name]));
    return (id: string) => m.get(id) ?? "Unknown";
  }, [people]);
  const deptIdsOf = useMemo(() => {
    const m = new Map(people.map((p) => [p.id, p.departmentIds]));
    return (id: string) => m.get(id) ?? [];
  }, [people]);

  const filtered = useMemo(
    () =>
      reports.filter((r) => {
        if (employee && r.employee_id !== employee) return false;
        if (dept && !deptIdsOf(r.employee_id).includes(dept)) return false;
        if (from && r.report_date < from) return false;
        if (to && r.report_date > to) return false;
        return true;
      }),
    [reports, employee, dept, from, to, deptIdsOf],
  );

  const selectClass =
    "rounded-xl border bg-background px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select value={employee} onChange={(e) => setEmployee(e.target.value)} className={selectClass}>
          <option value="">Everyone</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select value={dept} onChange={(e) => setDept(e.target.value)} className={selectClass}>
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={selectClass} />
          <span>→</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={selectClass} />
        </span>
        {(employee || dept || from || to) && (
          <button
            type="button"
            onClick={() => {
              setEmployee("");
              setDept("");
              setFrom("");
              setTo("");
            }}
            className="text-xs font-medium text-muted-foreground transition hover:text-foreground"
          >
            Clear
          </button>
        )}
      </div>

      <p className="mb-3 text-xs text-muted-foreground">
        {filtered.length} report{filtered.length === 1 ? "" : "s"}
      </p>

      <div className="space-y-2">
        {filtered.map((r) => (
          <EodReportCard
            key={r.id}
            report={r}
            employeeName={nameOf(r.employee_id)}
            defaultOpen={
              Boolean(initialEmployee) &&
              r.employee_id === initialEmployee &&
              r.report_date === initialDate
            }
          />
        ))}
        {filtered.length === 0 && (
          <p className="rounded-xl border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
            No reports match these filters.
          </p>
        )}
      </div>
    </div>
  );
}
