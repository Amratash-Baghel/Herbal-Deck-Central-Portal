"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { SearchIcon } from "@/components/icons";

export interface ReviewListRow {
  id: string;
  name: string;
  email: string;
  departmentNames: string[];
}

function initials(name: string): string {
  return name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

/** Searchable roster; each person links to their full review. */
export function EmployeeReviewList({ rows }: { rows: ReviewListRow[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      `${r.name} ${r.email} ${r.departmentNames.join(" ")}`.toLowerCase().includes(q),
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
                <p className="truncate text-sm font-medium">{r.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {r.departmentNames.join(", ") || "No department"}
                </p>
              </div>
              <span className="text-xs font-medium text-primary">View review →</span>
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
