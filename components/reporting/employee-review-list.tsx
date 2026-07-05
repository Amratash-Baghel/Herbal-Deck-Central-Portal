"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { SearchIcon } from "@/components/icons";

export interface ReviewListRow {
  id: string;
  name: string;
  email: string;
  departmentNames: string[];
  /** Currently open (not done) tasks. */
  open: number;
  /** Open tasks already past their deadline. */
  overdue: number;
  /** On-time completion rate 0–100, or null if no deadlines have come due. */
  onTimeRate: number | null;
  /** Completed within the roster window. */
  completed: number;
}

function initials(name: string): string {
  return name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

/** A small labelled figure in the per-person signal cluster. */
function Metric({
  value,
  label,
  tone,
}: {
  value: string;
  label: string;
  tone?: "danger" | "good";
}) {
  const valueTone =
    tone === "danger"
      ? "text-red-600 dark:text-red-400"
      : tone === "good"
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-foreground";
  return (
    <div className="w-14 text-center">
      <p className={`text-sm font-semibold tabular-nums ${valueTone}`}>{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}

/**
 * Searchable roster with per-person task signals (open load, overdue, on-time
 * rate, recent throughput). People with overdue work sort to the top so the
 * cases that need attention surface first. Each row links to the full review.
 */
export function EmployeeReviewList({
  rows,
  windowDays,
}: {
  rows: ReviewListRow[];
  windowDays: number;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? rows.filter((r) =>
          `${r.name} ${r.email} ${r.departmentNames.join(" ")}`.toLowerCase().includes(q),
        )
      : rows;
    // Surface problems first: most overdue, then most open, then alphabetical.
    return [...base].sort(
      (a, b) =>
        b.overdue - a.overdue || b.open - a.open || a.name.localeCompare(b.name),
    );
  }, [rows, query]);

  return (
    <div className="rounded-2xl border bg-card shadow-sm">
      <div className="border-b px-6 py-4">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, email, or department…"
            className="w-full rounded-xl border bg-background py-2 pl-9 pr-3 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Open &amp; overdue are live; on-time and done cover the last {windowDays} days.
        </p>
      </div>
      <ul className="divide-y">
        {filtered.map((r) => (
          <li key={r.id}>
            <Link
              href={`/reporting/employees/${r.id}`}
              className="flex items-center gap-3 px-6 py-3.5 transition hover:bg-accent/50"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-primary">
                {initials(r.name)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium">{r.name}</p>
                  {r.overdue > 0 && (
                    <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-950/50 dark:text-red-300">
                      {r.overdue} overdue
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {r.departmentNames.join(", ") || "No department"}
                </p>
              </div>

              <div className="hidden shrink-0 items-center gap-1 sm:flex">
                <Metric
                  value={String(r.open)}
                  label="Open"
                  tone={r.overdue > 0 ? "danger" : undefined}
                />
                <Metric
                  value={r.onTimeRate === null ? "—" : `${r.onTimeRate}%`}
                  label="On time"
                  tone={
                    r.onTimeRate === null
                      ? undefined
                      : r.onTimeRate >= 80
                        ? "good"
                        : r.onTimeRate < 50
                          ? "danger"
                          : undefined
                  }
                />
                <Metric value={String(r.completed)} label="Done" />
              </div>
            </Link>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="px-6 py-10 text-center text-sm text-muted-foreground">
            No one matches “{query}”.
          </li>
        )}
      </ul>
    </div>
  );
}
