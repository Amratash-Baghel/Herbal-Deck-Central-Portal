import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { BillingIcon } from "@/components/icons";

/**
 * Billing hub. The first live tool is the invoice generator; expense tracking
 * and spend analytics are scaffolded here and land in later phases.
 */
export default function BillingPage() {
  return (
    <>
      <PageHeader
        title="Billing & Invoices"
        description="Create invoices, and (soon) track expenses and review spend."
      />

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {/* Live: invoice generator */}
        <Link
          href="/billing/generate"
          className="group flex flex-col rounded-2xl border bg-card p-6 shadow-sm transition hover:border-primary/40 hover:shadow"
        >
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-primary">
            <BillingIcon className="h-5 w-5" />
          </span>
          <h2 className="mt-4 text-base font-semibold tracking-tight">
            Create an invoice
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Fill in the details and download a branded PDF invoice in seconds.
          </p>
          <span className="mt-4 text-sm font-medium text-primary group-hover:underline">
            Open generator →
          </span>
        </Link>

        {/* Live: expense tracking */}
        <Link
          href="/billing/invoices"
          className="group flex flex-col rounded-2xl border bg-card p-6 shadow-sm transition hover:border-primary/40 hover:shadow"
        >
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-primary">
            <BillingIcon className="h-5 w-5" />
          </span>
          <h2 className="mt-4 text-base font-semibold tracking-tight">
            Posted invoices
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Track posted invoices by department and category, upload the signed
            copy, and clear or reject — with a record of who cleared each one.
          </p>
          <span className="mt-4 text-sm font-medium text-primary group-hover:underline">
            Open tracking →
          </span>
        </Link>

        {/* Coming soon: analytics */}
        <div className="flex flex-col rounded-2xl border border-dashed bg-muted/40 p-6">
          <h2 className="text-base font-semibold tracking-tight">
            Spend analytics
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            See where the money goes — totals by category, department, and month.
          </p>
          <span className="mt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Coming soon
          </span>
        </div>
      </div>
    </>
  );
}
