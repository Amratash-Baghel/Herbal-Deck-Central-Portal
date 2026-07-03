"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatClockTZ, timeAgo } from "@/lib/time";
import type { DeptRef } from "@/components/tasks/types";

export interface OverviewRow {
  id: string;
  name: string;
  departmentIds: string[];
  departmentNames: string[];
  arrivedAt: string | null;
  lastSeenAt: string | null;
  eodSubmittedAt: string | null;
  incomplete: boolean;
  completedToday: number;
}

const ONLINE_WINDOW_MS = 15 * 60 * 1000;

function initials(name: string): string {
  return name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

/**
 * Today's activity table. "Online" = active in the last 15 minutes (computed at
 * render, so it reflects when the page loaded). Filter by department; jump to a
 * person's EOD for today or their full review.
 */
export function TeamOverview({
  rows,
  departments,
  today,
}: {
  rows: OverviewRow[];
  departments: DeptRef[];
  today: string;
}) {
  const [dept, setDept] = useState("");
  // Captured once at mount — "online" reflects when the page loaded.
  const [now] = useState(() => Date.now());

  const filtered = useMemo(
    () => (dept ? rows.filter((r) => r.departmentIds.includes(dept)) : rows),
    [rows, dept],
  );

  const isOnline = (r: OverviewRow) =>
    r.lastSeenAt !== null && now - Date.parse(r.lastSeenAt) <= ONLINE_WINDOW_MS;

  const onlineCount = filtered.filter(isOnline).length;
  const submittedCount = filtered.filter((r) => r.eodSubmittedAt).length;
  const notSeenCount = filtered.filter((r) => !r.lastSeenAt).length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <select
          value={dept}
          onChange={(e) => setDept(e.target.value)}
          className="rounded-xl border bg-background px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <div className="flex flex-wrap gap-4 text-sm">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            <strong>{onlineCount}</strong>
            <span className="text-muted-foreground">online</span>
          </span>
          <span>
            <strong>{submittedCount}</strong>{" "}
            <span className="text-muted-foreground">submitted EOD</span>
          </span>
          <span>
            <strong>{notSeenCount}</strong>{" "}
            <span className="text-muted-foreground">not seen today</span>
          </span>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Person</th>
                <th className="px-3 py-2.5 font-medium">Arrived</th>
                <th className="px-3 py-2.5 font-medium">Last active</th>
                <th className="px-3 py-2.5 font-medium">EOD</th>
                <th className="px-3 py-2.5 text-center font-medium">Done today</th>
                <th className="px-3 py-2.5 text-right font-medium">Report</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((r) => {
                const online = isOnline(r);
                return (
                  <tr key={r.id} className="hover:bg-accent/40">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-semibold text-primary">
                          {initials(r.name)}
                          {online && (
                            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-green-500" />
                          )}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium">{r.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {r.departmentNames.join(", ") || "No department"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                      {r.arrivedAt ? formatClockTZ(r.arrivedAt) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {r.lastSeenAt ? (
                        online ? (
                          <span className="text-green-600 dark:text-green-400">Now</span>
                        ) : (
                          timeAgo(r.lastSeenAt)
                        )
                      ) : (
                        <span className="text-red-600 dark:text-red-400">Not seen</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {r.eodSubmittedAt ? (
                        <Link
                          href={`/reporting/eod?employee=${r.id}&date=${today}`}
                          className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-primary transition hover:underline"
                        >
                          {formatClockTZ(r.eodSubmittedAt)}
                        </Link>
                      ) : r.incomplete ? (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-950/50 dark:text-red-300">
                          Incomplete
                        </span>
                      ) : (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                          Not submitted
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center tabular-nums">
                      {r.completedToday}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Link
                        href={`/reporting/employees/${r.id}`}
                        className="text-xs font-medium text-primary transition hover:underline"
                      >
                        View review →
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    No employees to show.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
