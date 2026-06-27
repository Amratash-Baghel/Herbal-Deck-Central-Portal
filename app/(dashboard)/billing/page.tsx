import Link from "next/link";
import { getUserAccess } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { BillingIcon } from "@/components/icons";

/**
 * Billing overview — three tools: generate a PDF, post an invoice into
 * tracking, and (for managers) clear posted invoices.
 */
export default async function BillingPage() {
  const access = await getUserAccess();
  const canClear = Boolean(access?.canManageBilling);

  const cards = [
    {
      href: "/billing/generate",
      title: "Invoice generator",
      body: "Pick a template, fill in the details, and download a branded PDF. Creating only — nothing is posted.",
      cta: "Open generator →",
      show: true,
    },
    {
      href: "/billing/post",
      title: "Post invoices",
      body: "Record a generated invoice into tracking under your name and department, so management can clear it.",
      cta: "Post an invoice →",
      show: true,
    },
    {
      href: "/billing/clearing",
      title: "Clear invoices",
      body: "Review posted invoices by department and status, upload signed copies, and clear or reject.",
      cta: "Open clearing →",
      show: canClear,
    },
    {
      href: "/billing/analytics",
      title: "Spend analytics",
      body: "Cleared spend across departments, categories, and months — with pending shown for forecasting.",
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

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="group flex flex-col rounded-2xl border bg-card p-6 shadow-sm transition hover:border-primary/40 hover:shadow"
          >
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-primary">
              <BillingIcon className="h-5 w-5" />
            </span>
            <h2 className="mt-4 text-base font-semibold tracking-tight">
              {card.title}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{card.body}</p>
            <span className="mt-4 text-sm font-medium text-primary group-hover:underline">
              {card.cta}
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}
