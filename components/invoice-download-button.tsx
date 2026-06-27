"use client";

import { useState } from "react";
import { downloadInvoicePdf, type InvoiceData } from "@/lib/invoice-pdf";
import { DownloadIcon } from "@/components/icons";

/**
 * Re-download the branded PDF for a posted invoice. The PDF is rebuilt in the
 * browser from the stored `document` payload — identical to what the employee
 * first generated.
 */
export function InvoiceDownloadButton({ document }: { document: InvoiceData }) {
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    setBusy(true);
    try {
      await downloadInvoicePdf(document);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition hover:bg-accent disabled:opacity-60"
    >
      <DownloadIcon className="h-3.5 w-3.5" />
      {busy ? "Preparing…" : "PDF"}
    </button>
  );
}
