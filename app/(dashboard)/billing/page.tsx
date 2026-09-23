import Link from "next/link";
import { getUserAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { BillingIcon } from "@/components/icons";
import { formatMoney } from "@/lib/money";

/**
 * Billing overview — the three tools (generate, post, clear) plus, for the
 * people who own the numbers, a roll-up of what the other tabs contain. The
 * cards keep their order, their links and their shape; each just carries the
 * one figure that tells you whether it needs your attention today.
 */
export default async function BillingPage() {
  const access = await getUserAccess();
  const canClear = Boolean(access?.canManageBilling);

  const supabase = await createClient();
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const since = monthStart.toISOString();

  // RLS already scopes this: a manager sees everything, an employee sees their
  // own. That's exactly the scoping the cards want, so there's no branch here.
  const [invoiceRes, pettyRes] = await Promise.all([
    supabase.from("invoices").select("status, amount, created_at, created_by"),
    canClear
      ? supabase.from("misc_payments").select("amount").gte("created_at", since)
      : Promise.resolve({ data: [] as { amount: number }[] }),
  ]);

  const invoices = invoiceRes.data ?? [];
  const sum = (rows: { amount: number }[]) =>
    rows.reduce((t, r) => t + Number(r.amount), 0);

  const pending = invoices.filter((i) => i.status === "pending");
  const clearedThisMonth = invoices.filter(
    (i) => i.status === "cleared" && i.created_at >= since,
  );
  const mine = invoices.filter((i) => i.created_by === access?.profile.id);
  const pettyThisMonth = sum(pettyRes.data ?? []);

  const cards = [
    {
      href: "/billing/generate",
      title: "Invoice generator",
      body: "Pick a template, fill in the details, and download a branded PDF. Creating only — nothing is posted.",
      stat: null,
      cta: "Open generator →",
      show: true,
    },
    {
      href: "/billing/post",
      title: "Post invoices",
      body: "Record a generated invoice into tracking under your name and department, so management can clear it.",
      stat: `${mine.length} posted by you`,
      cta: "Post an invoice →",
      show: true,
    },
    {
      href: "/billing/clearing",
      title: "Clear invoices",
      body: "Review posted invoices by department and status, upload signed copies, and clear or reject.",
      stat: `${pending.length} awaiting clearing`,
      cta: "Open clearing →",
      show: canClear,
    },
    {
      href: "/billing/analytics",
      title: "Spend analytics",
      body: "Cleared spend across departments, categories, and months — with pending shown for forecasting.",
      stat: `${formatMoney(sum(clearedThisMonth), "INR")} cleared this month`,
      cta: "Open analytics →",
      show: canClear,
    },
  ].filter((c) => c.show);

  return (
    <>
      <PageHeader
        title="Billing & Invoices"
        description="Generate invoices, post them into tracking, and clear them."
      />

      {/* The roll-up the tools below can't show you at a glance. Managers only:
        * these are company figures, not the signed-in person's. */}
      {canClear && (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Kpi
            label="Awaiting clearing"
            value={formatMoney(sum(pending), "INR")}
            sub={`${pending.length} ${pending.length === 1 ? "invoice" : "invoices"}`}
          />
          <Kpi
            label="Cleared this month"
            value={formatMoney(sum(clearedThisMonth), "INR")}
            sub={`${clearedThisMonth.length} ${
              clearedThisMonth.length === 1 ? "invoice" : "invoices"
            }`}
          />
          <Kpi
            label="Petty cash this month"
            value={formatMoney(pettyThisMonth, "INR")}
            sub="Recorded by HR & Management"
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="cal-sheet group flex flex-col rounded-2xl border bg-card p-6 transition hover:border-primary/40 hover:shadow"
          >
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-primary dark:text-ring">
              <BillingIcon className="h-5 w-5" />
            </span>
            <h2 className="mt-4 text-base font-semibold tracking-tight">
              {card.title}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{card.body}</p>
            {card.stat && (
              <p className="mt-3 text-sm font-medium tabular-nums">{card.stat}</p>
            )}
            <span className="mt-4 text-sm font-medium text-primary group-hover:underline">
              {card.cta}
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}

/** Same shape as the Petty Cash KPIs, so the two tabs read as one system. */
function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="cal-sheet rounded-2xl border bg-card p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}
