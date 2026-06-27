/**
 * Framework-agnostic invoice document model + draw context. Kept jsPDF-free at
 * runtime (only type-level imports) so it can be shared by the form, the PDF
 * builder, and the template definitions without pulling jsPDF onto the server.
 */

import type { jsPDF } from "jspdf";
import type { UserOptions } from "jspdf-autotable";
import type { CurrencyCode } from "@/lib/money";

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
}

/** Bank / tax details the service provider fills in so they can be paid. */
export interface PaymentDetails {
  accountHolder: string;
  accountNumber: string;
  bankName: string;
  ifsc: string;
  swift: string;
  pan: string;
}

export interface InvoiceData {
  /** Which visual template to render with (see lib/invoice-templates). */
  templateId: string;
  /** Service provider being paid (the invoice issuer). */
  fromName: string;
  fromDetails: string;
  /** Bill-to — Herbal Deck, fixed. */
  toName: string;
  toDetails: string;
  invoiceNumber: string;
  issueDate: string; // ISO yyyy-mm-dd
  currency: CurrencyCode;
  items: InvoiceLineItem[];
  taxRate: number; // percent
  notes: string;
  payment: PaymentDetails;
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

/** The labelled payment rows, in display order. */
export function paymentRows(p: PaymentDetails): [string, string][] {
  return [
    ["Account Holder", p.accountHolder],
    ["Account Number", p.accountNumber],
    ["Bank Name", p.bankName],
    ["IFSC", p.ifsc],
    ["Swift Code", p.swift],
    ["PAN No", p.pan],
  ];
}

type AutoTableFn = (doc: jsPDF, options: UserOptions) => void;
export type RGB = [number, number, number];

/**
 * Everything a template needs to draw one invoice. `money` and `date` are
 * pre-bound formatters (ASCII-safe currency for the PDF).
 */
export interface DrawCtx {
  doc: jsPDF;
  autoTable: AutoTableFn;
  data: InvoiceData;
  totals: InvoiceTotals;
  pageWidth: number;
  pageHeight: number;
  margin: number;
  money: (n: number) => string;
  date: (iso: string) => string;
}

export interface InvoiceTemplate {
  id: string;
  name: string;
  /** One-line description of the look, shown in the picker. */
  description: string;
  draw: (ctx: DrawCtx) => void;
}
