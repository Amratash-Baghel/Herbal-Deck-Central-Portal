"use client";

import { useMemo, useState } from "react";
import { InvoiceStatusBadge } from "@/components/invoice-status-badge";
import { SearchIcon } from "@/components/icons";
import { formatMoney, type CurrencyCode } from "@/lib/money";
import type { InvoiceStatus } from "@/lib/types";

export interface DeptInvoiceRow {
  id: string;
  invoiceNumber: string;
  employeeName: string;
  vendorName: string | null;
  reason: string | null;
  amount: number;
  currency: string;
  status: InvoiceStatus;
  createdAt: string;
  proofUrl: string | null;
}

type SortKey = "date" | "amount" | "status" | "employee";

const SORTS: { value: SortKey; label: string }[] = [
  { value: "date", label: "Date" },
  { value: "amount", label: "Amount" },
  { value: "status", label: "Status" },
  { value: "employee", label: "Employee" },
];

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * Read-only department invoice list for team leads (and managers): every
 * invoice posted by someone in the department, searchable by employee / amount /
 * details and sortable. Cleared invoices link to their payment proof.
 */
export function DeptInvoicesList({ invoices }: { invoices: DeptInvoiceRow[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("date");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = q
      ? invoices.filter((i) =>
          `${i.employeeName} ${i.amount} ${i.invoiceNumber} ${i.vendorName ?? ""} ${i.reason ?? ""}`
            .toLowerCase()
            .includes(q),
        )
      : invoices;

    return [...rows].sort((a, b) => {
      switch (sort) {
        case "amount":
          return b.amount - a.amount;
        case "status":
          return a.status.localeCompare(b.status);
        case "employee":
          return a.employeeName.localeCompare(b.employeeName);
        default:
          return Date.parse(b.createdAt) - Date.parse(a.createdAt);
      }
    });
  }, [invoices, query, sort]);

  return (
    <div className="rounded-2xl border bg-card shadow-sm">
      <div className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-xs">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search employee, amount, details…"
            className="w-full rounded-xl border bg-background py-2 pl-9 pr-3 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-1 text-xs text-muted-foreground">Sort:</span>
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
        {filtered.map((i) => (
          <li key={i.id} className="flex items-start justify-between gap-3 px-5 py-3.5">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{i.employeeName}</span>
                <InvoiceStatusBadge status={i.status} />
                <span className="text-xs text-muted-foreground">
                  {formatDate(i.createdAt)}
                </span>
              </div>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                #{i.invoiceNumber}
                {i.vendorName ? ` · ${i.vendorName}` : ""}
                {i.reason ? ` · ${i.reason}` : ""}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className="text-sm font-semibold tabular-nums">
                {formatMoney(Number(i.amount), (i.currency as CurrencyCode) ?? "INR")}
              </span>
              {i.proofUrl && (
                <a
                  href={i.proofUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-primary transition hover:underline"
                >
                  View payment proof
                </a>
              )}
            </div>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="px-5 py-10 text-center text-sm text-muted-foreground">
            {invoices.length === 0
              ? "No invoices posted in your department yet."
              : "No invoices match your search."}
          </li>
        )}
      </ul>
    </div>
  );
}
