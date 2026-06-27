import { requireProfile } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { InvoiceGenerator } from "@/components/invoice-generator";

/**
 * Invoice generator — a standalone tool for any signed-in employee. Fill in the
 * details, pick a template, and download a branded PDF. It does not post or
 * store anything; that happens in the separate "Post" section.
 */
export default async function GenerateInvoicePage() {
  await requireProfile();

  return (
    <>
      <PageHeader
        title="Invoice Generator"
        description="Pick a template, fill in the details, and download a branded PDF. Creating only — nothing is posted here."
      />
      <InvoiceGenerator />
    </>
  );
}
