/**
 * Invoice document model + PDF generator.
 *
 * The PDF is built entirely in the browser with jsPDF, so "Download" is instant
 * and never depends on the network or the server. jsPDF + jsPDF-AutoTable are
 * imported dynamically inside downloadInvoicePdf() so they stay out of the
 * server bundle and only load when someone actually downloads.
 */

import { formatMoney, type CurrencyCode } from "@/lib/money";

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface InvoiceData {
  /** Issuer (your company). */
  fromName: string;
  fromDetails: string; // free-text address / contact, one detail per line
  /** Recipient. */
  toName: string;
  toDetails: string;
  invoiceNumber: string;
  issueDate: string; // ISO yyyy-mm-dd
  dueDate: string; // ISO yyyy-mm-dd
  currency: CurrencyCode;
  items: InvoiceLineItem[];
  taxRate: number; // percent, e.g. 18 for 18%
  notes: string;
}

export interface InvoiceTotals {
  subtotal: number;
  tax: number;
  total: number;
}

/** Sum line items and apply the tax rate. Tolerant of NaN/empty inputs. */
export function computeTotals(
  items: InvoiceLineItem[],
  taxRate: number,
): InvoiceTotals {
  const subtotal = items.reduce(
    (sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0),
    0,
  );
  const tax = subtotal * ((Number(taxRate) || 0) / 100);
  return { subtotal, tax, total: subtotal + tax };
}

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

// Brand palette as RGB tuples for jsPDF.
const BRAND: [number, number, number] = [26, 92, 56]; // #1a5c38
const INK: [number, number, number] = [26, 26, 26];
const MUTED: [number, number, number] = [110, 120, 115];

/**
 * Render `data` to a PDF and trigger a download in the user's browser.
 * Filename is derived from the invoice number.
 */
export async function downloadInvoicePdf(data: InvoiceData): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const right = pageWidth - margin;
  const ascii = { ascii: true } as const;
  const totals = computeTotals(data.items, data.taxRate);

  // --- Header: issuer (left) + INVOICE title & meta (right) ----------------
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...BRAND);
  doc.text(data.fromName || "Invoice", margin, 22);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  const fromLines = (data.fromDetails || "").split("\n").filter(Boolean);
  if (fromLines.length) doc.text(fromLines, margin, 28);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.setTextColor(...INK);
  doc.text("INVOICE", right, 22, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  doc.text(`# ${data.invoiceNumber || "—"}`, right, 29, { align: "right" });
  doc.text(`Issued: ${formatDate(data.issueDate)}`, right, 34, { align: "right" });
  doc.text(`Due: ${formatDate(data.dueDate)}`, right, 39, { align: "right" });

  // --- Divider --------------------------------------------------------------
  doc.setDrawColor(...BRAND);
  doc.setLineWidth(0.6);
  doc.line(margin, 46, right, 46);

  // --- Bill To --------------------------------------------------------------
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...BRAND);
  doc.text("BILL TO", margin, 55);

  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.text(data.toName || "—", margin, 61);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  const toLines = (data.toDetails || "").split("\n").filter(Boolean);
  if (toLines.length) doc.text(toLines, margin, 66);

  // --- Line items table -----------------------------------------------------
  autoTable(doc, {
    startY: 78,
    head: [["#", "Description", "Qty", "Unit Price", "Amount"]],
    body: data.items.map((item, idx) => [
      String(idx + 1),
      item.description || "—",
      String(item.quantity ?? 0),
      formatMoney(item.unitPrice ?? 0, data.currency, ascii),
      formatMoney(
        (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0),
        data.currency,
        ascii,
      ),
    ]),
    theme: "striped",
    headStyles: {
      fillColor: BRAND,
      textColor: [255, 255, 255],
      fontStyle: "bold",
    },
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: {
      0: { halign: "left", cellWidth: 10 },
      2: { halign: "right", cellWidth: 18 },
      3: { halign: "right", cellWidth: 32 },
      4: { halign: "right", cellWidth: 32 },
    },
    margin: { left: margin, right: margin },
  });

  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } })
    .lastAutoTable.finalY;

  // --- Totals (right-aligned block) ----------------------------------------
  let y = finalY + 10;
  const labelX = right - 60;
  const valueX = right;

  const totalRow = (label: string, value: string, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setTextColor(...(bold ? INK : MUTED));
    doc.text(label, labelX, y);
    doc.setTextColor(...INK);
    doc.text(value, valueX, y, { align: "right" });
    y += 6;
  };

  doc.setFontSize(10);
  totalRow("Subtotal", formatMoney(totals.subtotal, data.currency, ascii));
  if ((Number(data.taxRate) || 0) > 0) {
    totalRow(
      `Tax (${data.taxRate}%)`,
      formatMoney(totals.tax, data.currency, ascii),
    );
  }
  doc.setDrawColor(...MUTED);
  doc.setLineWidth(0.2);
  doc.line(labelX, y - 3, valueX, y - 3);
  doc.setFontSize(12);
  totalRow("Total", formatMoney(totals.total, data.currency, ascii), true);

  // --- Notes ----------------------------------------------------------------
  if (data.notes?.trim()) {
    y += 6;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...BRAND);
    doc.text("NOTES", margin, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MUTED);
    const noteLines = doc.splitTextToSize(
      data.notes.trim(),
      pageWidth - margin * 2,
    );
    doc.text(noteLines, margin, y);
  }

  // --- Footer ---------------------------------------------------------------
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text("Generated with the Herbal Deck Portal", margin, pageHeight - 10);

  const safeNumber = (data.invoiceNumber || "invoice").replace(/[^\w-]+/g, "-");
  doc.save(`Invoice-${safeNumber}.pdf`);
}
