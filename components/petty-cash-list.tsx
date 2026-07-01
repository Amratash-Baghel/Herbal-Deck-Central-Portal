"use client";

import { useMemo, useState } from "react";
import { deletePettyCashEntry } from "@/app/(dashboard)/billing/actions";
import { SearchIcon, TrashIcon } from "@/components/icons";
import { formatMoney } from "@/lib/money";
import type { MiscPayment } from "@/lib/types";

type SortKey = "date_desc" | "date_asc" | "amount_desc" | "amount_asc";

const SORTS: { value: SortKey; label: string }[] = [
  { value: "date_desc", label: "Newest" },
  { value: "date_asc", label: "Oldest" },
  { value: "amount_desc", label: "Highest" },
  { value: "amount_asc", label: "Lowest" },
];

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * Searchable, sortable petty cash ledger. Search matches who it was paid to or
 * the reason; sort by date or amount. Any HR & Management member can delete an
 * entry (e.g. a typo) — RLS backs this the same way it backs everything else
 * here, so the control simply mirrors what the database already allows.
 */
export function PettyCashList({ entries }: { entries: MiscPayment[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("date_desc");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = q
      ? entries.filter((e) =>
          `${e.paid_to ?? ""} ${e.description}`.toLowerCase().includes(q),
        )
      : entries;

    return [...rows].sort((a, b) => {
      switch (sort) {
        case "date_asc":
          return Date.parse(a.created_at) - Date.parse(b.created_at);
        case "amount_desc":
          return b.amount - a.amount;
        case "amount_asc":
          return a.amount - b.amount;
        default:
          return Date.parse(b.created_at) - Date.parse(a.created_at);
      }
    });
  }, [entries, query, sort]);

  return (
    <div className="rounded-2xl border bg-card shadow-sm">
      <div className="flex flex-col gap-3 border-b px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-xs">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by who or why…"
            className="w-full rounded-xl border bg-background py-2 pl-9 pr-3 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {SORTS.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setSort(s.value)}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                sort === s.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <ul className="divide-y">
        {filtered.map((e) => (
          <li key={e.id} className="flex items-start justify-between gap-3 px-6 py-3.5">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-sm font-medium">{e.paid_to || "—"}</span>
                <span className="text-xs text-muted-foreground">
                  {formatDate(e.created_at)}
                </span>
              </div>
              <p className="mt-0.5 truncate text-sm text-muted-foreground">
                {e.description}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className="text-sm font-semibold tabular-nums">
                {formatMoney(e.amount, "INR")}
              </span>
              <form action={deletePettyCashEntry}>
                <input type="hidden" name="entry_id" value={e.id} />
                <button
                  type="submit"
                  onClick={(ev) => {
                    if (!confirm("Delete this petty cash entry?")) {
                      ev.preventDefault();
                    }
                  }}
                  aria-label="Delete entry"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-red-600"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </form>
            </div>
          </li>
        ))}

        {filtered.length === 0 && (
          <li className="px-6 py-10 text-center text-sm text-muted-foreground">
            {entries.length === 0
              ? "No petty cash recorded yet."
              : `No entries match "${query}".`}
          </li>
        )}
      </ul>
    </div>
  );
}
