import { PageHeader } from "@/components/page-header";

/**
 * Billing & Invoices — placeholder. No billing logic yet; this establishes the
 * route and layout so the module can be built out later.
 */
export default function BillingPage() {
  return (
    <>
      <PageHeader
        title="Billing & Invoices"
        description="Track invoices, payments, and billing activity."
      />

      <div className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-dashed bg-muted/40 p-10 text-center">
        <h2 className="text-lg font-medium">Module coming soon</h2>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          The billing module will live here. We&apos;ll add invoice management,
          payment tracking, and reporting in a future release.
        </p>
      </div>
    </>
  );
}
