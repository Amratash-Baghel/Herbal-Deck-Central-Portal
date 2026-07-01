import { requireBillingManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { formatMoney, type CurrencyCode } from "@/lib/money";
import { time } from "@/lib/perf";
import { INVOICE_LIST_COLUMNS, type Invoice } from "@/lib/types";

// Totals are summed in the company's base currency (see note in the UI).
const BASE: CurrencyCode = "INR";
const NO_CATEGORY = "__none__";

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** The month an invoice belongs to — issue date if set, else when posted. */
function invoiceMonth(i: Invoice): string {
  return monthKey(new Date(i.issue_date ?? i.created_at));
}

function sumAmount(rows: Invoice[]): number {
  return rows.reduce((s, i) => s + (Number(i.amount) || 0), 0);
}

/** A labelled horizontal bar (share of `max`). */
function BarRow({
  label,
  amount,
  max,
}: {
  label: string;
  amount: number;
  max: number;
}) {
  const pct = max > 0 ? Math.round((amount / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-32 shrink-0 truncate text-sm">{label}</span>
      <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-primary"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-28 shrink-0 text-right text-sm tabular-nums">
        {formatMoney(amount, BASE)}
      </span>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

/**
 * Spend analytics — admins + HR & Management only. Aggregates the invoices
 * table in-process (the dataset is small); "spend" means cleared invoices,
 * with pending shown alongside for forecasting.
 */
export default async function AnalyticsPage() {
  await requireBillingManager();

  const supabase = await createClient();
  const [invoiceRes, deptRes, catRes] = await time("billing/analytics:list+depts+cats", () =>
    Promise.all([
      supabase.from("invoices").select(INVOICE_LIST_COLUMNS),
      supabase.from("departments").select("id, name").order("name"),
      supabase.from("invoice_categories").select("id, name").order("name"),
    ]),
  );

  const all = (invoiceRes.data as Invoice[]) ?? [];
  const departments = (deptRes.data as { id: string; name: string }[]) ?? [];
  const categories = (catRes.data as { id: string; name: string }[]) ?? [];

  const cleared = all.filter((i) => i.status === "cleared");
  const pending = all.filter((i) => i.status === "pending");
  const rejected = all.filter((i) => i.status === "rejected");

  const totalCleared = sumAmount(cleared);
  const totalPending = sumAmount(pending);
  const thisMonth = monthKey(new Date());
  const clearedThisMonth = sumAmount(
    cleared.filter((i) => invoiceMonth(i) === thisMonth),
  );

  // By department (cleared spend) — every department, sorted desc.
  const deptTotal = new Map<string, number>();
  for (const i of cleared) {
    deptTotal.set(
      i.department_id,
      (deptTotal.get(i.department_id) ?? 0) + (Number(i.amount) || 0),
    );
  }
  const deptRows = departments
    .map((d) => ({ label: d.name, amount: deptTotal.get(d.id) ?? 0 }))
    .sort((a, b) => b.amount - a.amount);
  const deptMax = Math.max(1, ...deptRows.map((r) => r.amount));

  // By category (cleared spend), including uncategorised.
  const catTotal = new Map<string, number>();
  for (const i of cleared) {
    const key = i.category_id ?? NO_CATEGORY;
    catTotal.set(key, (catTotal.get(key) ?? 0) + (Number(i.amount) || 0));
  }
  const catRows = [
    ...categories.map((c) => ({ label: c.name, amount: catTotal.get(c.id) ?? 0 })),
    { label: "Uncategorised", amount: catTotal.get(NO_CATEGORY) ?? 0 },
  ]
    .filter((r) => r.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  const catMax = Math.max(1, ...catRows.map((r) => r.amount));

  // By month (last 12), cleared spend.
  const base = new Date();
  const months = Array.from({ length: 12 }, (_, idx) => {
    const d = new Date(base.getFullYear(), base.getMonth() - (11 - idx), 1);
    return {
      key: monthKey(d),
      label: d.toLocaleDateString("en-GB", { month: "short" }),
      isJan: d.getMonth() === 0,
      year: String(d.getFullYear()).slice(2),
    };
  });
  const monthTotal = new Map<string, number>();
  for (const i of cleared) {
    const m = invoiceMonth(i);
    monthTotal.set(m, (monthTotal.get(m) ?? 0) + (Number(i.amount) || 0));
  }
  const monthData = months.map((m) => ({
    ...m,
    amount: monthTotal.get(m.key) ?? 0,
  }));
  const monthMax = Math.max(1, ...monthData.map((m) => m.amount));

  const hasData = all.length > 0;

  return (
    <>
      <PageHeader
        title="Spend Analytics"
        description="Cleared spend across departments, categories, and months. Pending shown for forecasting."
      />

      {!hasData ? (
        <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed bg-muted/40 p-10 text-center">
          <h2 className="text-lg font-medium">No data yet</h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Once invoices are posted and cleared, spend breakdowns appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Kpi
              label="Cleared spend"
              value={formatMoney(totalCleared, BASE)}
              sub={`${cleared.length} invoice${cleared.length === 1 ? "" : "s"}`}
            />
            <Kpi
              label="Pending"
              value={formatMoney(totalPending, BASE)}
              sub={`${pending.length} awaiting clearing`}
            />
            <Kpi
              label="Cleared this month"
              value={formatMoney(clearedThisMonth, BASE)}
              sub={new Date().toLocaleDateString("en-GB", {
                month: "long",
                year: "numeric",
              })}
            />
            <Kpi
              label="Rejected"
              value={formatMoney(sumAmount(rejected), BASE)}
              sub={`${rejected.length} invoice${rejected.length === 1 ? "" : "s"}`}
            />
          </div>

          {/* Monthly trend */}
          <section className="rounded-2xl border bg-card p-6 shadow-sm">
            <h2 className="text-base font-semibold tracking-tight">
              Cleared spend — last 12 months
            </h2>
            <div className="mt-6 flex h-44 items-end gap-2">
              {monthData.map((m) => {
                const h = monthMax > 0 ? (m.amount / monthMax) * 100 : 0;
                return (
                  <div
                    key={m.key}
                    className="flex flex-1 flex-col items-center gap-1.5"
                  >
                    <div className="flex h-32 w-full items-end justify-center">
                      <div
                        className="w-full max-w-8 rounded-t bg-primary/80"
                        style={{ height: `${h}%` }}
                        title={formatMoney(m.amount, BASE)}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {m.label}
                      {m.isJan && ` '${m.year}`}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Department + category breakdowns */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section className="rounded-2xl border bg-card p-6 shadow-sm">
              <h2 className="text-base font-semibold tracking-tight">
                By department
              </h2>
              <div className="mt-5 space-y-3">
                {deptRows.map((r) => (
                  <BarRow
                    key={r.label}
                    label={r.label}
                    amount={r.amount}
                    max={deptMax}
                  />
                ))}
              </div>
            </section>

            <section className="rounded-2xl border bg-card p-6 shadow-sm">
              <h2 className="text-base font-semibold tracking-tight">
                By category
              </h2>
              {catRows.length === 0 ? (
                <p className="mt-5 text-sm text-muted-foreground">
                  No cleared spend to categorise yet.
                </p>
              ) : (
                <div className="mt-5 space-y-3">
                  {catRows.map((r) => (
                    <BarRow
                      key={r.label}
                      label={r.label}
                      amount={r.amount}
                      max={catMax}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>

          <p className="text-xs text-muted-foreground">
            Totals are summed in {BASE}. Invoices raised in other currencies are
            included at face value.
          </p>
        </div>
      )}
    </>
  );
}
