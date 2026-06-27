/**
 * Invoice PDF builder. Creates the jsPDF document in the browser and hands it
 * to the selected template's draw() function. jsPDF + AutoTable are imported
 * dynamically so they stay out of the server bundle and only load on demand.
 *
 * Types and the totals helper are re-exported from lib/invoice-types so the
 * rest of the app can keep importing them from "@/lib/invoice-pdf".
 */

import { formatMoney, type CurrencyCode } from "@/lib/money";
import {
  computeTotals,
  type DrawCtx,
  type InvoiceData,
  type InvoiceLineItem,
  type InvoiceTotals,
  type PaymentDetails,
} from "@/lib/invoice-types";
import { getTemplate } from "@/lib/invoice-templates";

export {
  computeTotals,
  type InvoiceData,
  type InvoiceLineItem,
  type InvoiceTotals,
  type PaymentDetails,
};

function formatDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

async function buildDoc(data: InvoiceData) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const currency = data.currency as CurrencyCode;
  const totals: InvoiceTotals = computeTotals(data.items, data.taxRate);

  const ctx: DrawCtx = {
    doc,
    autoTable,
    data,
    totals,
    pageWidth: doc.internal.pageSize.getWidth(),
    pageHeight: doc.internal.pageSize.getHeight(),
    margin: 14,
    money: (n: number) => formatMoney(n, currency, { ascii: true }),
    date: formatDate,
  };

  getTemplate(data.templateId).draw(ctx);
  return doc;
}

/** Build the PDF and trigger a browser download. */
export async function downloadInvoicePdf(data: InvoiceData): Promise<void> {
  const doc = await buildDoc(data);
  const safe = (data.invoiceNumber || "invoice").replace(/[^\w-]+/g, "-");
  doc.save(`Invoice-${safe}.pdf`);
}

/**
 * Build the PDF and return a blob URL for an inline preview (e.g. an iframe).
 * The caller is responsible for revoking the URL when done.
 */
export async function renderInvoiceToBlobUrl(data: InvoiceData): Promise<string> {
  const doc = await buildDoc(data);
  return doc.output("bloburl").toString();
}
