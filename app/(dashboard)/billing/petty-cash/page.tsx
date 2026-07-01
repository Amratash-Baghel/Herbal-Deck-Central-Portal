import { requireBillingManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { PettyCashForm } from "@/components/petty-cash-form";
import { PettyCashList } from "@/components/petty-cash-list";
import { formatMoney } from "@/lib/money";
import { localDateISO, isoDaysAgo } from "@/lib/time";
import type { MiscPayment } from "@/lib/types";

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
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

function sum(rows: MiscPayment[]): number {
  return rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Petty Cash — HR & Management only (same gate as Clear/Analytics). A simple
 * ledger for one-off cash payments: record who was paid, why, and how much
 * (INR only), then search/sort the history. KPIs and the trend are aggregated
 * in-process over `misc_payments`, bucketed by IST to match the rest of the
 * portal's day/month boundaries.
 */
export default async function PettyCashPage() {
  await requireBillingManager();

  const supabase = await createClient();
  const { data } = await supabase
    .from("misc_payments")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  const entries = (data ?? []) as MiscPayment[];

  const today = localDateISO();
  const todayTotal = sum(
    entries.filter((e) => localDateISO("Asia/Kolkata", new Date(e.created_at)) === today),
  );

  const weekAgo = Date.parse(isoDaysAgo(7));
  const weekTotal = sum(entries.filter((e) => Date.parse(e.created_at) >= weekAgo));

  const thisMonth = monthKey(new Date());
  const monthTotal = sum(
    entries.filter((e) => monthKey(new Date(e.created_at)) === thisMonth),
  );

  const allTimeTotal = sum(entries);

  // Trend — last 6 months.
  const base = new Date();
  const months = Array.from({ length: 6 }, (_, idx) => {
    const d = new Date(base.getFullYear(), base.getMonth() - (5 - idx), 1);
    return { key: monthKey(d), label: d.toLocaleDateString("en-GB", { month: "short" }) };
  });
  const byMonth = new Map<string, number>();
  for (const e of entries) {
    const k = monthKey(new Date(e.created_at));
    byMonth.set(k, (byMonth.get(k) ?? 0) + (Number(e.amount) || 0));
  }
  const monthData = months.map((m) => ({ ...m, amount: byMonth.get(m.key) ?? 0 }));
  const monthMax = Math.max(1, ...monthData.map((m) => m.amount));

  return (
    <>
      <PageHeader
        title="Petty Cash"
        description="A simple ledger for one-off cash payments — HR & Management only."
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Today" value={formatMoney(todayTotal, "INR")} />
        <Kpi label="Last 7 days" value={formatMoney(weekTotal, "INR")} />
        <Kpi
          label="This month"
          value={formatMoney(monthTotal, "INR")}
          sub={new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
        />
        <Kpi
          label="All-time"
          value={formatMoney(allTimeTotal, "INR")}
          sub={`${entries.length} entr${entries.length === 1 ? "y" : "ies"}`}
        />
      </div>

      <section className="mb-6 rounded-2xl border bg-card p-6 shadow-sm">
        <h2 className="text-base font-semibold tracking-tight">
          Last 6 months
        </h2>
        <div className="mt-6 flex h-36 items-end gap-3">
          {monthData.map((m) => {
            const h = monthMax > 0 ? (m.amount / monthMax) * 100 : 0;
            return (
              <div key={m.key} className="flex flex-1 flex-col items-center gap-1.5">
                <div className="flex h-28 w-full items-end justify-center">
                  <div
                    className="w-full max-w-10 rounded-t bg-primary/80"
                    style={{ height: `${h}%` }}
                    title={formatMoney(m.amount, "INR")}
                  />
                </div>
                <span className="text-[11px] text-muted-foreground">{m.label}</span>
              </div>
            );
          })}
        </div>
      </section>

      <div className="mb-6">
        <PettyCashForm />
      </div>

      <PettyCashList entries={entries} />
    </>
  );
}
