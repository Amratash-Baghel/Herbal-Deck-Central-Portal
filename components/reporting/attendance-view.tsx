"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatClockTZ, formatMs } from "@/lib/time";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import {
  buildAttendance,
  summarize,
  monthBounds,
  dateRange,
  STATUS_META,
  type ActivityLite,
  type AttendanceRow,
} from "@/lib/attendance";

export interface AttendancePerson {
  id: string;
  name: string;
  departmentIds?: string[];
}

const selectClass =
  "rounded-xl border bg-background px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring";

function fmtDayLabel(dateISO: string): { weekday: string; day: string } {
  const d = new Date(`${dateISO}T00:00:00Z`);
  return {
    weekday: d.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" }),
    day: d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" }),
  };
}

function StatusBadge({ status }: { status: AttendanceRow["status"] }) {
  const meta = STATUS_META[status];
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.tone}`}>
      {meta.label}
    </span>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border bg-background px-3 py-2 text-center">
      <p className={`text-lg font-semibold tracking-tight ${tone ?? ""}`}>{value}</p>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}

/**
 * Daywise attendance for one employee over a month. Monday–Saturday are working
 * days (Sundays show as "Off" and are never flagged); arriving by 10 AM is on
 * time. Managers/leads can pick any employee they may see (and filter by
 * department); an employee sees only their own. Data is read through the
 * RLS-scoped browser client, so the database is the authority on visibility.
 */
export function AttendanceView({
  people,
  departments = [],
  selfId,
  canPickOthers,
  todayISO,
}: {
  people: AttendancePerson[];
  departments?: { id: string; name: string }[];
  selfId: string;
  canPickOthers: boolean;
  todayISO: string;
}) {
  const [supabase] = useState(() => createClient());
  const [dept, setDept] = useState("");
  const [employee, setEmployee] = useState(
    () => (people.some((p) => p.id === selfId) ? selfId : people[0]?.id) ?? "",
  );
  const [monthOffset, setMonthOffset] = useState(0);
  // Keyed by the request params so "loading" is derived (no synchronous
  // setState inside the fetch effect).
  const [loaded, setLoaded] = useState<{ key: string; logs: ActivityLite[] }>({
    key: "",
    logs: [],
  });

  const [baseYear, baseMonth] = useMemo(() => {
    const [y, m] = todayISO.split("-").map(Number);
    return [y, m - 1] as const;
  }, [todayISO]);

  const { year, month } = useMemo(() => {
    const d = new Date(Date.UTC(baseYear, baseMonth + monthOffset, 1));
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
  }, [baseYear, baseMonth, monthOffset]);

  const { start, end } = useMemo(() => monthBounds(year, month), [year, month]);
  const monthLabel = new Date(Date.UTC(year, month, 1)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const pickable = useMemo(
    () =>
      canPickOthers && dept
        ? people.filter((p) => (p.departmentIds ?? []).includes(dept))
        : people,
    [people, dept, canPickOthers],
  );

  // Derived, not stored: as the department filter narrows the list, fall back to
  // the first pickable person rather than adjusting state inside an effect.
  const effEmployee = pickable.some((p) => p.id === employee)
    ? employee
    : (pickable[0]?.id ?? "");

  const currentKey = `${effEmployee}|${start}|${end}`;

  useEffect(() => {
    if (!effEmployee) return;
    let cancelled = false;
    supabase
      .from("activity_logs")
      .select("date, first_seen_at, last_seen_at, eod_submitted_at")
      .eq("employee_id", effEmployee)
      .gte("date", start)
      .lte("date", end)
      .then(({ data }) => {
        if (cancelled) return;
        setLoaded({ key: currentKey, logs: (data ?? []) as ActivityLite[] });
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, effEmployee, start, end, currentKey]);

  const loading = !!effEmployee && loaded.key !== currentKey;

  const rows = useMemo(() => {
    const logs = loaded.key === currentKey ? loaded.logs : [];
    return buildAttendance(dateRange(start, end), todayISO, logs);
  }, [start, end, todayISO, loaded, currentKey]);
  const stats = useMemo(() => summarize(rows), [rows]);

  return (
    <div>
      {/* Controls */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {canPickOthers && departments.length > 0 && (
          <select value={dept} onChange={(e) => setDept(e.target.value)} className={selectClass}>
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        )}
        {canPickOthers ? (
          <select
            value={effEmployee}
            onChange={(e) => setEmployee(e.target.value)}
            className={selectClass}
          >
            {pickable.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-sm font-medium">Your attendance</span>
        )}

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMonthOffset((v) => v - 1)}
            aria-label="Previous month"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border text-muted-foreground transition hover:bg-accent hover:text-foreground"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <span className="w-32 text-center text-sm font-medium">{monthLabel}</span>
          <button
            type="button"
            onClick={() => setMonthOffset((v) => Math.min(0, v + 1))}
            disabled={monthOffset >= 0}
            aria-label="Next month"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-40"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Monthly summary */}
      <div className="mb-4 grid grid-cols-3 gap-3 sm:grid-cols-5">
        <Stat
          label="On-time %"
          value={stats.onTimePct === null ? "—" : `${stats.onTimePct}%`}
          tone="text-emerald-600 dark:text-emerald-400"
        />
        <Stat
          label="Late %"
          value={stats.latePct === null ? "—" : `${stats.latePct}%`}
          tone="text-amber-600 dark:text-amber-400"
        />
        <Stat label="Late days" value={String(stats.late)} />
        <Stat
          label="Absent"
          value={String(stats.absent)}
          tone={stats.absent > 0 ? "text-red-600 dark:text-red-400" : undefined}
        />
        <Stat
          label="Incomplete"
          value={String(stats.incomplete)}
          tone={stats.incomplete > 0 ? "text-orange-600 dark:text-orange-400" : undefined}
        />
      </div>

      {/* Daywise table */}
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Date</th>
                <th className="px-3 py-2.5 font-medium">Arrived</th>
                <th className="px-3 py-2.5 font-medium">Departed</th>
                <th className="px-3 py-2.5 font-medium">Active</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && !effEmployee && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    No employees to show.
                  </td>
                </tr>
              )}
              {!loading &&
                effEmployee &&
                rows.map((r) => {
                  const { weekday, day } = fmtDayLabel(r.date);
                  const off = r.status === "off";
                  return (
                    <tr key={r.date} className={off ? "bg-muted/30" : ""}>
                      <td className="px-4 py-2 font-medium">
                        <span className="text-muted-foreground">{weekday}</span> {day}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">
                        {r.arrival ? formatClockTZ(r.arrival) : "—"}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">
                        {r.departure && r.eodSubmitted ? formatClockTZ(r.departure) : "—"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {formatMs(r.activeMs) ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge status={r.status} />
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Working days are Mon–Sat, 10 AM–6 PM IST. Sundays are off. Arriving by 10 AM
        counts as on time.
      </p>
    </div>
  );
}
