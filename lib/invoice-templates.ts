/**
 * Eight visually and structurally distinct invoice templates. Each `draw`
 * paints one full A4 invoice using the shared DrawCtx. They deliberately differ
 * in layout, colour, typography, and table structure so a batch of invoices
 * doesn't look mass-produced.
 *
 * Templates are jsPDF-free at runtime: jsPDF is only a type. The real document
 * is created in lib/invoice-pdf.ts, which calls the selected template's draw().
 */

import {
  paymentRows,
  type DrawCtx,
  type InvoiceTemplate,
  type RGB,
} from "@/lib/invoice-types";

const WHITE: RGB = [255, 255, 255];
const MUTED: RGB = [110, 116, 120];
const PAY_LABEL: RGB = [90, 96, 100];
const PAY_VALUE: RGB = [40, 44, 48];

function lastY(doc: DrawCtx["doc"]): number {
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
    .finalY;
}

function lines(text: string): string[] {
  return (text || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Full item rows: number, description, qty, rate, amount. */
function fullItems(ctx: DrawCtx): (string | number)[][] {
  return ctx.data.items.map((it, i) => [
    i + 1,
    it.description || "—",
    String(it.quantity ?? 0),
    ctx.money(it.unitPrice ?? 0),
    ctx.money((Number(it.quantity) || 0) * (Number(it.unitPrice) || 0)),
  ]);
}

/** Simple item rows: description, amount only. */
function simpleItems(ctx: DrawCtx): (string | number)[][] {
  return ctx.data.items.map((it) => [
    it.description || "—",
    ctx.money((Number(it.quantity) || 0) * (Number(it.unitPrice) || 0)),
  ]);
}

/** Draw the payment-details rows as text starting at (x, y); returns new y. */
function drawPayment(
  ctx: DrawCtx,
  x: number,
  y: number,
  opts: { labelColor?: RGB; valueColor?: RGB; gap?: number; labelW?: number } = {},
): number {
  const { doc } = ctx;
  const gap = opts.gap ?? 5;
  const labelW = opts.labelW ?? 28;
  for (const [label, value] of paymentRows(ctx.data.payment)) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...(opts.labelColor ?? PAY_LABEL));
    doc.text(`${label}:`, x, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...(opts.valueColor ?? PAY_VALUE));
    doc.text(value || "—", x + labelW, y);
    y += gap;
  }
  return y;
}

function drawNotes(ctx: DrawCtx, x: number, y: number, accent: RGB): number {
  const note = ctx.data.notes?.trim();
  if (!note) return y;
  const { doc } = ctx;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...accent);
  doc.text("NOTES", x, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MUTED);
  const wrapped = doc.splitTextToSize(note, ctx.pageWidth - x - ctx.margin);
  doc.text(wrapped, x, y + 5);
  return y + 5 + wrapped.length * 4.5;
}

function footer(ctx: DrawCtx, accent: RGB) {
  const { doc } = ctx;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...accent);
  doc.text(
    "Generated with the Herbal Deck Portal",
    ctx.margin,
    ctx.pageHeight - 10,
  );
}

// ===========================================================================
// 1. CLASSIC — forest green, provider top-left, striped table, payment box
// ===========================================================================
const ACCENT_GREEN: RGB = [26, 92, 56];

function drawClassic(ctx: DrawCtx) {
  const { doc, data, totals, margin, pageWidth, money, date } = ctx;
  const right = pageWidth - margin;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...ACCENT_GREEN);
  doc.text(data.fromName || "Service Provider", margin, 22);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(lines(data.fromDetails), margin, 28);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.setTextColor(40, 40, 40);
  doc.text("INVOICE", right, 22, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  doc.text(`# ${data.invoiceNumber}`, right, 29, { align: "right" });
  doc.text(`Date: ${date(data.issueDate)}`, right, 34, { align: "right" });

  doc.setDrawColor(...ACCENT_GREEN);
  doc.setLineWidth(0.6);
  doc.line(margin, 42, right, 42);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...ACCENT_GREEN);
  doc.text("BILL TO", margin, 51);
  doc.setFontSize(11);
  doc.setTextColor(40, 40, 40);
  doc.text(data.toName, margin, 57);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(lines(data.toDetails), margin, 62);

  ctx.autoTable(doc, {
    startY: 78,
    head: [["#", "Description", "Qty", "Rate", "Amount"]],
    body: fullItems(ctx),
    theme: "striped",
    headStyles: { fillColor: ACCENT_GREEN, textColor: WHITE, fontStyle: "bold" },
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: {
      0: { cellWidth: 10 },
      2: { halign: "right", cellWidth: 18 },
      3: { halign: "right", cellWidth: 30 },
      4: { halign: "right", cellWidth: 32 },
    },
    margin: { left: margin, right: margin },
  });

  let y = lastY(doc) + 10;
  const labelX = right - 60;
  doc.setFontSize(10);
  const row = (l: string, v: string, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setTextColor(...(bold ? ACCENT_GREEN : MUTED));
    doc.text(l, labelX, y);
    doc.setTextColor(40, 40, 40);
    doc.text(v, right, y, { align: "right" });
    y += 6;
  };
  row("Subtotal", money(totals.subtotal));
  if (data.taxRate > 0) row(`Tax (${data.taxRate}%)`, money(totals.tax));
  doc.setDrawColor(...MUTED);
  doc.setLineWidth(0.2);
  doc.line(labelX, y - 3, right, y - 3);
  doc.setFontSize(12);
  row("Grand Total", money(totals.total), true);

  const payY = lastY(doc) + 12;
  doc.setDrawColor(...ACCENT_GREEN);
  doc.setLineWidth(0.4);
  doc.roundedRect(margin, payY, 90, 44, 2, 2, "S");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...ACCENT_GREEN);
  doc.text("PAYMENT DETAILS", margin + 4, payY + 7);
  drawPayment(ctx, margin + 4, payY + 14, { gap: 5 });

  const afterY = drawNotes(ctx, margin, payY + 62, ACCENT_GREEN);
  void afterY;
  footer(ctx, MUTED);
}

// ===========================================================================
// 2. MINIMAL — monochrome, centred title, Description/Amount only
// ===========================================================================
const INK: RGB = [24, 24, 24];

function drawMinimal(ctx: DrawCtx) {
  const { doc, data, totals, margin, pageWidth, money, date } = ctx;
  const right = pageWidth - margin;
  const center = pageWidth / 2;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...INK);
  doc.text("INVOICE", center, 24, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(`No. ${data.invoiceNumber}    ·    ${date(data.issueDate)}`, center, 31, {
    align: "center",
  });

  doc.setDrawColor(210, 210, 210);
  doc.setLineWidth(0.3);
  doc.line(margin, 38, right, 38);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...INK);
  doc.text("FROM", margin, 48);
  doc.text("TO", center + 4, 48);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text([data.fromName, ...lines(data.fromDetails)], margin, 54);
  doc.text([data.toName, ...lines(data.toDetails)], center + 4, 54);

  ctx.autoTable(doc, {
    startY: 76,
    head: [["Description", "Amount"]],
    body: simpleItems(ctx),
    theme: "plain",
    headStyles: {
      textColor: INK,
      fontStyle: "bold",
      lineWidth: { bottom: 0.4 },
      lineColor: [180, 180, 180],
    },
    bodyStyles: { lineWidth: { bottom: 0.1 }, lineColor: [225, 225, 225] },
    styles: { fontSize: 10, cellPadding: { top: 3, bottom: 3, left: 0, right: 0 } },
    columnStyles: { 1: { halign: "right", cellWidth: 40 } },
    margin: { left: margin, right: margin },
  });

  let y = lastY(doc) + 8;
  doc.setFontSize(10);
  const row = (l: string, v: string, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setTextColor(...INK);
    doc.text(l, right - 50, y);
    doc.text(v, right, y, { align: "right" });
    y += 6;
  };
  if (data.taxRate > 0) {
    row("Subtotal", money(totals.subtotal));
    row(`Tax ${data.taxRate}%`, money(totals.tax));
  }
  doc.setLineWidth(0.3);
  doc.setDrawColor(180, 180, 180);
  doc.line(right - 50, y - 3, right, y - 3);
  doc.setFontSize(12);
  row("Total", money(totals.total), true);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...INK);
  doc.text("PAYMENT DETAILS", margin, y + 8);
  const afterPay = drawPayment(ctx, margin, y + 15, { gap: 5 });
  drawNotes(ctx, margin, afterPay + 4, INK);
  footer(ctx, MUTED);
}

// ===========================================================================
// 3. BANDED — full-width indigo band, grid table, filled total bar
// ===========================================================================
const INDIGO: RGB = [49, 46, 129];

function drawBanded(ctx: DrawCtx) {
  const { doc, data, totals, margin, pageWidth, money, date } = ctx;
  const right = pageWidth - margin;

  doc.setFillColor(...INDIGO);
  doc.rect(0, 0, pageWidth, 34, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.setTextColor(...WHITE);
  doc.text("INVOICE", margin, 21);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`# ${data.invoiceNumber}`, right, 16, { align: "right" });
  doc.text(date(data.issueDate), right, 23, { align: "right" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...INDIGO);
  doc.text("FROM", margin, 47);
  doc.text("BILL TO", right - 70, 47);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text([data.fromName, ...lines(data.fromDetails)], margin, 53);
  doc.text([data.toName, ...lines(data.toDetails)], right - 70, 53);

  ctx.autoTable(doc, {
    startY: 78,
    head: [["#", "Description", "Qty", "Rate", "Amount"]],
    body: fullItems(ctx),
    theme: "grid",
    headStyles: { fillColor: INDIGO, textColor: WHITE, fontStyle: "bold" },
    styles: { fontSize: 9, cellPadding: 3, lineColor: [220, 220, 235] },
    columnStyles: {
      0: { cellWidth: 10 },
      2: { halign: "right", cellWidth: 18 },
      3: { halign: "right", cellWidth: 30 },
      4: { halign: "right", cellWidth: 32 },
    },
    margin: { left: margin, right: margin },
  });

  let y = lastY(doc) + 8;
  if (data.taxRate > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    doc.text("Subtotal", right - 60, y);
    doc.setTextColor(40, 40, 40);
    doc.text(money(totals.subtotal), right, y, { align: "right" });
    y += 6;
    doc.setTextColor(...MUTED);
    doc.text(`Tax (${data.taxRate}%)`, right - 60, y);
    doc.setTextColor(40, 40, 40);
    doc.text(money(totals.tax), right, y, { align: "right" });
    y += 4;
  }
  doc.setFillColor(...INDIGO);
  doc.rect(right - 70, y, 70, 11, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...WHITE);
  doc.text("GRAND TOTAL", right - 66, y + 7);
  doc.text(money(totals.total), right - 3, y + 7, { align: "right" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...INDIGO);
  doc.text("PAYMENT DETAILS", margin, lastY(doc) + 22);
  const afterPay = drawPayment(ctx, margin, lastY(doc) + 29, { gap: 5 });
  drawNotes(ctx, margin, afterPay + 4, INDIGO);
  footer(ctx, MUTED);
}

// ===========================================================================
// 4. SIDEBAR — teal vertical panel holding meta + payment, content on right
// ===========================================================================
const TEAL: RGB = [15, 118, 110];

function drawSidebar(ctx: DrawCtx) {
  const { doc, data, totals, margin, pageWidth, pageHeight, money, date } = ctx;
  const sbW = 58;
  const cx = sbW + 8; // content x
  const right = pageWidth - margin;

  doc.setFillColor(...TEAL);
  doc.rect(0, 0, sbW, pageHeight, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...WHITE);
  doc.text("INVOICE", 8, 22);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`# ${data.invoiceNumber}`, 8, 31);
  doc.text(date(data.issueDate), 8, 37);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("PAY TO", 8, 56);
  doc.setFontSize(7.5);
  let py = 63;
  for (const [label, value] of paymentRows(data.payment)) {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...WHITE);
    doc.text(label, 8, py);
    doc.setFont("helvetica", "normal");
    doc.text(doc.splitTextToSize(value || "—", sbW - 12), 8, py + 4);
    py += 11;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...TEAL);
  doc.text(data.fromName || "Service Provider", cx, 22);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(lines(data.fromDetails), cx, 28);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...TEAL);
  doc.text("BILL TO", cx, 46);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text([data.toName, ...lines(data.toDetails)], cx, 52);

  ctx.autoTable(doc, {
    startY: 72,
    head: [["Description", "Qty", "Amount"]],
    body: data.items.map((it) => [
      it.description || "—",
      String(it.quantity ?? 0),
      ctx.money((Number(it.quantity) || 0) * (Number(it.unitPrice) || 0)),
    ]),
    theme: "striped",
    headStyles: { fillColor: TEAL, textColor: WHITE, fontStyle: "bold" },
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: {
      1: { halign: "right", cellWidth: 18 },
      2: { halign: "right", cellWidth: 34 },
    },
    margin: { left: cx, right: margin },
  });

  let y = lastY(doc) + 9;
  doc.setFontSize(10);
  const row = (l: string, v: string, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setTextColor(...(bold ? TEAL : MUTED));
    doc.text(l, right - 55, y);
    doc.setTextColor(40, 40, 40);
    doc.text(v, right, y, { align: "right" });
    y += 6;
  };
  if (data.taxRate > 0) {
    row("Subtotal", money(totals.subtotal));
    row(`Tax (${data.taxRate}%)`, money(totals.tax));
  }
  doc.setFontSize(12);
  row("Grand Total", money(totals.total), true);
  drawNotes(ctx, cx, y + 6, TEAL);
  footer(ctx, MUTED);
}

// ===========================================================================
// 5. BORDERED — formal slate, outer frame, grid table, boxed payment
// ===========================================================================
const SLATE: RGB = [51, 65, 85];

function drawBordered(ctx: DrawCtx) {
  const { doc, data, totals, margin, pageWidth, pageHeight, money, date } = ctx;
  const right = pageWidth - margin;

  doc.setDrawColor(...SLATE);
  doc.setLineWidth(0.5);
  doc.rect(margin, margin, pageWidth - margin * 2, pageHeight - margin * 2, "S");

  const ix = margin + 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...SLATE);
  doc.text(data.fromName || "Service Provider", ix, margin + 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(lines(data.fromDetails), ix, margin + 18);

  doc.setDrawColor(...SLATE);
  doc.setLineWidth(0.3);
  doc.rect(right - 60, margin + 4, 54, 18, "S");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...SLATE);
  doc.text("INVOICE No.", right - 57, margin + 10);
  doc.text("DATE", right - 57, margin + 17);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(40, 40, 40);
  doc.text(data.invoiceNumber, right - 9, margin + 10, { align: "right" });
  doc.text(date(data.issueDate), right - 9, margin + 17, { align: "right" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...SLATE);
  doc.text("BILL TO", ix, margin + 34);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text([data.toName, ...lines(data.toDetails)], ix, margin + 40);

  ctx.autoTable(doc, {
    startY: margin + 56,
    head: [["#", "Description", "Qty", "Rate", "Amount"]],
    body: fullItems(ctx),
    theme: "grid",
    headStyles: { fillColor: SLATE, textColor: WHITE, fontStyle: "bold" },
    styles: { fontSize: 9, cellPadding: 3, lineColor: [200, 205, 215] },
    columnStyles: {
      0: { cellWidth: 10 },
      2: { halign: "right", cellWidth: 18 },
      3: { halign: "right", cellWidth: 30 },
      4: { halign: "right", cellWidth: 32 },
    },
    margin: { left: ix, right: margin + 6 },
  });

  let y = lastY(doc) + 8;
  doc.setFontSize(10);
  const row = (l: string, v: string, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setTextColor(...(bold ? SLATE : MUTED));
    doc.text(l, right - 60, y);
    doc.setTextColor(40, 40, 40);
    doc.text(v, right - 6, y, { align: "right" });
    y += 6;
  };
  if (data.taxRate > 0) {
    row("Subtotal", money(totals.subtotal));
    row(`Tax (${data.taxRate}%)`, money(totals.tax));
  }
  doc.setFontSize(12);
  row("Grand Total", money(totals.total), true);

  const boxY = y + 4;
  doc.setDrawColor(...SLATE);
  doc.setLineWidth(0.3);
  doc.rect(ix, boxY, 92, 42, "S");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...SLATE);
  doc.text("PAYMENT DETAILS", ix + 4, boxY + 7);
  drawPayment(ctx, ix + 4, boxY + 14, { gap: 5 });
  drawNotes(ctx, ix, boxY + 50, SLATE);
}

// ===========================================================================
// 6. ELEGANT — burgundy, serif (times), centred, ruled
// ===========================================================================
const BURGUNDY: RGB = [124, 45, 45];

function drawElegant(ctx: DrawCtx) {
  const { doc, data, totals, margin, pageWidth, money, date } = ctx;
  const right = pageWidth - margin;
  const center = pageWidth / 2;

  doc.setFont("times", "bold");
  doc.setFontSize(24);
  doc.setTextColor(...BURGUNDY);
  doc.text(data.fromName || "Service Provider", center, 24, { align: "center" });
  doc.setFont("times", "italic");
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  doc.text(lines(data.fromDetails).join("  ·  ") || " ", center, 31, {
    align: "center",
  });

  doc.setDrawColor(...BURGUNDY);
  doc.setLineWidth(0.5);
  doc.line(margin, 37, right, 37);
  doc.setLineWidth(0.2);
  doc.line(margin, 38.5, right, 38.5);

  doc.setFont("times", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...BURGUNDY);
  doc.text("I N V O I C E", center, 48, { align: "center" });
  doc.setFont("times", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  doc.text(`No. ${data.invoiceNumber}   ·   ${date(data.issueDate)}`, center, 55, {
    align: "center",
  });

  doc.setFont("times", "bold");
  doc.setFontSize(11);
  doc.setTextColor(40, 40, 40);
  doc.text("Billed To", margin, 68);
  doc.setFont("times", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  doc.text([data.toName, ...lines(data.toDetails)], margin, 74);

  ctx.autoTable(doc, {
    startY: 92,
    head: [["Description", "Qty", "Rate", "Amount"]],
    body: data.items.map((it) => [
      it.description || "—",
      String(it.quantity ?? 0),
      ctx.money(it.unitPrice ?? 0),
      ctx.money((Number(it.quantity) || 0) * (Number(it.unitPrice) || 0)),
    ]),
    theme: "plain",
    headStyles: {
      font: "times",
      textColor: BURGUNDY,
      fontStyle: "bold",
      lineWidth: { bottom: 0.4 },
      lineColor: BURGUNDY,
    },
    bodyStyles: {
      font: "times",
      lineWidth: { bottom: 0.1 },
      lineColor: [220, 210, 210],
    },
    styles: { fontSize: 10, cellPadding: 3 },
    columnStyles: {
      1: { halign: "right", cellWidth: 18 },
      2: { halign: "right", cellWidth: 30 },
      3: { halign: "right", cellWidth: 32 },
    },
    margin: { left: margin, right: margin },
  });

  let y = lastY(doc) + 9;
  doc.setFont("times", "normal");
  doc.setFontSize(11);
  const row = (l: string, v: string, bold = false) => {
    doc.setFont("times", bold ? "bold" : "normal");
    doc.setTextColor(...(bold ? BURGUNDY : MUTED));
    doc.text(l, right - 55, y);
    doc.setTextColor(40, 40, 40);
    doc.text(v, right, y, { align: "right" });
    y += 6.5;
  };
  if (data.taxRate > 0) {
    row("Subtotal", money(totals.subtotal));
    row(`Tax (${data.taxRate}%)`, money(totals.tax));
  }
  doc.setFontSize(13);
  row("Total", money(totals.total), true);

  doc.setFont("times", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...BURGUNDY);
  doc.text("Payment Details", margin, y + 8);
  // Payment rows in serif for cohesion.
  let py = y + 15;
  for (const [label, value] of paymentRows(data.payment)) {
    doc.setFont("times", "bold");
    doc.setFontSize(9);
    doc.setTextColor(90, 96, 100);
    doc.text(`${label}:`, margin, py);
    doc.setFont("times", "normal");
    doc.setTextColor(40, 44, 48);
    doc.text(value || "—", margin + 28, py);
    py += 5;
  }
  footer(ctx, MUTED);
}

// ===========================================================================
// 7. COMPACT — charcoal, dense single-column receipt style
// ===========================================================================
const CHARCOAL: RGB = [38, 38, 38];

function drawCompact(ctx: DrawCtx) {
  const { doc, data, totals, margin, pageWidth, money, date } = ctx;
  const right = pageWidth - margin;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...CHARCOAL);
  doc.text(data.fromName || "Service Provider", margin, 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(lines(data.fromDetails).join("  ·  ") || " ", margin, 23);

  doc.setDrawColor(...CHARCOAL);
  doc.setLineWidth(1.2);
  doc.line(margin, 27, right, 27);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...CHARCOAL);
  doc.text("INVOICE", margin, 35);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MUTED);
  doc.text(
    `#${data.invoiceNumber}   ·   ${date(data.issueDate)}`,
    right,
    35,
    { align: "right" },
  );
  doc.setTextColor(...CHARCOAL);
  doc.text(`Bill to: ${data.toName}`, margin, 41);

  ctx.autoTable(doc, {
    startY: 47,
    head: [["Description", "Amount"]],
    body: simpleItems(ctx),
    theme: "plain",
    headStyles: {
      textColor: CHARCOAL,
      fontStyle: "bold",
      fontSize: 8,
      lineWidth: { bottom: 0.3 },
      lineColor: [120, 120, 120],
    },
    bodyStyles: { lineWidth: { bottom: 0.1 }, lineColor: [230, 230, 230] },
    styles: { fontSize: 8.5, cellPadding: { top: 2, bottom: 2, left: 0, right: 0 } },
    columnStyles: { 1: { halign: "right", cellWidth: 34 } },
    margin: { left: margin, right: margin },
  });

  let y = lastY(doc) + 6;
  doc.setFontSize(9);
  const row = (l: string, v: string, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setTextColor(...CHARCOAL);
    doc.text(l, right - 45, y);
    doc.text(v, right, y, { align: "right" });
    y += 5;
  };
  if (data.taxRate > 0) {
    row("Subtotal", money(totals.subtotal));
    row(`Tax ${data.taxRate}%`, money(totals.tax));
  }
  doc.setDrawColor(...CHARCOAL);
  doc.setLineWidth(0.5);
  doc.line(right - 45, y - 2, right, y - 2);
  doc.setFontSize(11);
  row("TOTAL", money(totals.total), true);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...CHARCOAL);
  doc.text("PAYMENT DETAILS", margin, y + 6);
  const rows = paymentRows(data.payment);
  let py = y + 12;
  const colW = (right - margin) / 2;
  rows.forEach(([label, value], i) => {
    const x = margin + (i % 2) * colW;
    if (i % 2 === 0 && i > 0) py += 5;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(90, 96, 100);
    doc.text(`${label}:`, x, py);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(40, 44, 48);
    doc.text(value || "—", x + 26, py);
  });
  drawNotes(ctx, margin, py + 9, CHARCOAL);
  footer(ctx, MUTED);
}

// ===========================================================================
// 8. TWO-TONE — split header blocks, highlighted total card, payment card
// ===========================================================================
const AMBER: RGB = [146, 64, 14];
const DARK: RGB = [23, 23, 23];

function drawTwoTone(ctx: DrawCtx) {
  const { doc, data, totals, margin, pageWidth, money, date } = ctx;
  const right = pageWidth - margin;
  const mid = pageWidth / 2;

  doc.setFillColor(...DARK);
  doc.rect(0, 0, mid, 32, "F");
  doc.setFillColor(...AMBER);
  doc.rect(mid, 0, pageWidth - mid, 32, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(...WHITE);
  doc.text(data.fromName || "Service Provider", margin, 15);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(lines(data.fromDetails), margin, 21);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...WHITE);
  doc.text("INVOICE", right, 14, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`# ${data.invoiceNumber}`, right, 21, { align: "right" });
  doc.text(date(data.issueDate), right, 27, { align: "right" });

  doc.setFillColor(247, 244, 240);
  doc.roundedRect(margin, 40, right - margin, 22, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...AMBER);
  doc.text("BILL TO", margin + 4, 47);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);
  doc.text([data.toName, ...lines(data.toDetails)], margin + 4, 53);

  ctx.autoTable(doc, {
    startY: 70,
    head: [["#", "Description", "Qty", "Rate", "Amount"]],
    body: fullItems(ctx),
    theme: "striped",
    headStyles: { fillColor: AMBER, textColor: WHITE, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [250, 246, 240] },
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: {
      0: { cellWidth: 10 },
      2: { halign: "right", cellWidth: 18 },
      3: { halign: "right", cellWidth: 30 },
      4: { halign: "right", cellWidth: 32 },
    },
    margin: { left: margin, right: margin },
  });

  let y = lastY(doc) + 8;
  if (data.taxRate > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    doc.text("Subtotal", right - 60, y);
    doc.setTextColor(40, 40, 40);
    doc.text(money(totals.subtotal), right, y, { align: "right" });
    y += 6;
    doc.setTextColor(...MUTED);
    doc.text(`Tax (${data.taxRate}%)`, right - 60, y);
    doc.setTextColor(40, 40, 40);
    doc.text(money(totals.tax), right, y, { align: "right" });
    y += 4;
  }
  doc.setFillColor(...AMBER);
  doc.roundedRect(right - 72, y, 72, 13, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...WHITE);
  doc.text("GRAND TOTAL", right - 68, y + 8);
  doc.text(money(totals.total), right - 4, y + 8, { align: "right" });

  const cardY = y + 22;
  doc.setFillColor(247, 244, 240);
  doc.roundedRect(margin, cardY, 96, 44, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...AMBER);
  doc.text("PAYMENT DETAILS", margin + 4, cardY + 8);
  drawPayment(ctx, margin + 4, cardY + 15, { gap: 5 });
  drawNotes(ctx, margin, cardY + 52, AMBER);
  footer(ctx, MUTED);
}

// ===========================================================================
// Registry
// ===========================================================================
export const TEMPLATES: InvoiceTemplate[] = [
  {
    id: "classic",
    name: "Classic Green",
    description: "Brand green, striped table, bordered payment box.",
    draw: drawClassic,
  },
  {
    id: "minimal",
    name: "Minimal",
    description: "Monochrome, centred title, lots of whitespace.",
    draw: drawMinimal,
  },
  {
    id: "banded",
    name: "Indigo Band",
    description: "Full-width header band with a filled total bar.",
    draw: drawBanded,
  },
  {
    id: "sidebar",
    name: "Teal Sidebar",
    description: "Vertical panel holding meta and bank details.",
    draw: drawSidebar,
  },
  {
    id: "bordered",
    name: "Formal Bordered",
    description: "Framed, gridded table — a traditional, formal look.",
    draw: drawBordered,
  },
  {
    id: "elegant",
    name: "Elegant Serif",
    description: "Centred serif type with ruled lines.",
    draw: drawElegant,
  },
  {
    id: "compact",
    name: "Compact Receipt",
    description: "Dense, single-column, receipt-like.",
    draw: drawCompact,
  },
  {
    id: "twotone",
    name: "Two-Tone Modern",
    description: "Split header blocks and a highlighted total card.",
    draw: drawTwoTone,
  },
];

export function getTemplate(id: string): InvoiceTemplate {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
}
