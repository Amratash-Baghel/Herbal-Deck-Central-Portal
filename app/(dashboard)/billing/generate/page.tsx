import { requireProfile } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { InvoiceGenerator } from "@/components/invoice-generator";

/**
 * Invoice generator — available to any signed-in employee. Fill in the details
 * and download a branded PDF invoice. The PDF is built in the browser, so no
 * file is uploaded or stored unless we add that later.
 */
export default async function GenerateInvoicePage() {
  await requireProfile();

  return (
    <>
      <PageHeader
        title="Create an Invoice"
        description="Fill in the details on the left, watch the preview update, then download a branded PDF."
      />
      <InvoiceGenerator />
    </>
  );
}
