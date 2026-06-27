"use client";

import { useMemo, useState } from "react";
import {
  computeTotals,
  downloadInvoicePdf,
  type InvoiceData,
  type InvoiceLineItem,
  type PaymentDetails,
} from "@/lib/invoice-pdf";
import { TEMPLATES } from "@/lib/invoice-templates";
import { CURRENCIES, formatMoney, type CurrencyCode } from "@/lib/money";
import { HERBAL_DECK, HERBAL_DECK_ADDRESS } from "@/lib/company";
import { InvoicePdfPreview } from "@/components/invoice-pdf-preview";
import { DownloadIcon, PlusIcon, TrashIcon } from "@/components/icons";

const inputClass =
  "w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring";
const labelClass = "text-sm font-medium";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function suggestNumber(): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const rand = Math.floor(100 + Math.random() * 900);
  return `HD-${yy}${mm}-${rand}`;
}

const emptyPayment: PaymentDetails = {
  accountHolder: "",
  accountNumber: "",
  bankName: "",
  ifsc: "",
  swift: "",
  pan: "",
};

const PAYMENT_FIELDS: { key: keyof PaymentDetails; label: string }[] = [
  { key: "accountHolder", label: "Account Holder" },
  { key: "accountNumber", label: "Account Number" },
  { key: "bankName", label: "Bank Name" },
  { key: "ifsc", label: "IFSC" },
  { key: "swift", label: "Swift Code" },
  { key: "pan", label: "PAN No" },
];

/**
 * Standalone invoice generator. The provider (issuer) fills in their details,
 * line items, and bank info; "Bill To" is fixed to Herbal Deck; the number and
 * date are pre-filled. Pick one of eight templates, watch the live PDF preview,
 * and download. This tool only creates PDFs — posting lives elsewhere.
 */
export function InvoiceGenerator() {
  const [templateId, setTemplateId] = useState(TEMPLATES[0].id);
  const [fromName, setFromName] = useState("");
  const [fromDetails, setFromDetails] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState(suggestNumber);
  const [issueDate, setIssueDate] = useState(todayIso);
  const [currency, setCurrency] = useState<CurrencyCode>("INR");
  const [taxRate, setTaxRate] = useState(0);
  const [notes, setNotes] = useState("");
  const [payment, setPayment] = useState<PaymentDetails>(emptyPayment);
  const [items, setItems] = useState<InvoiceLineItem[]>([
    { description: "", quantity: 1, unitPrice: 0 },
  ]);
  const [downloading, setDownloading] = useState(false);

  function updateItem(index: number, patch: Partial<InvoiceLineItem>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }
  function addItem() {
    setItems((prev) => [...prev, { description: "", quantity: 1, unitPrice: 0 }]);
  }
  function removeItem(index: number) {
    setItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }
  function updatePayment(key: keyof PaymentDetails, value: string) {
    setPayment((prev) => ({ ...prev, [key]: value }));
  }

  const data: InvoiceData = useMemo(
    () => ({
      templateId,
      fromName,
      fromDetails,
      toName: HERBAL_DECK.name,
      toDetails: HERBAL_DECK_ADDRESS,
      invoiceNumber,
      issueDate,
      currency,
      items,
      taxRate,
      notes,
      payment,
    }),
    [
      templateId,
      fromName,
      fromDetails,
      invoiceNumber,
      issueDate,
      currency,
      items,
      taxRate,
      notes,
      payment,
    ],
  );

  const totals = useMemo(() => computeTotals(items, taxRate), [items, taxRate]);

  async function handleDownload() {
    setDownloading(true);
    try {
      await downloadInvoicePdf(data);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-8 xl:grid-cols-[1fr_1.05fr]">
      {/* ---------------------------------------------------------------- Form */}
      <div className="space-y-6">
        {/* Template picker */}
        <section className="rounded-2xl border bg-card p-6 shadow-sm">
          <h2 className="text-base font-semibold tracking-tight">Template</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick a design — each varies in layout so invoices don&apos;t all look
            identical.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {TEMPLATES.map((t) => {
              const active = t.id === templateId;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTemplateId(t.id)}
                  className={`rounded-xl border px-3 py-2 text-left text-xs transition ${
                    active
                      ? "border-primary bg-accent text-primary"
                      : "hover:bg-accent"
                  }`}
                >
                  <span className="block font-semibold">{t.name}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {TEMPLATES.find((t) => t.id === templateId)?.description}
          </p>
        </section>

        {/* Bill From / Bill To */}
        <section className="rounded-2xl border bg-card p-6 shadow-sm">
          <h2 className="text-base font-semibold tracking-tight">Parties</h2>
          <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className={labelClass} htmlFor="fromName">
                Service provider (being paid)
              </label>
              <input
                id="fromName"
                className={inputClass}
                value={fromName}
                onChange={(e) => setFromName(e.target.value)}
                placeholder="Provider / influencer / page name"
              />
              <textarea
                className={`${inputClass} min-h-20 resize-y`}
                value={fromDetails}
                onChange={(e) => setFromDetails(e.target.value)}
                placeholder={"Address line\nEmail · Phone"}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className={labelClass}>Bill to</span>
              <div className="rounded-xl border bg-muted/40 px-3 py-2 text-sm">
                <p className="font-medium">{HERBAL_DECK.name}</p>
                <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">
                  {HERBAL_DECK_ADDRESS}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Fixed — every invoice is billed to Herbal Deck.
              </p>
            </div>
          </div>
        </section>

        {/* Invoice meta */}
        <section className="rounded-2xl border bg-card p-6 shadow-sm">
          <h2 className="text-base font-semibold tracking-tight">
            Invoice details
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className={labelClass} htmlFor="invoiceNumber">
                Invoice number{" "}
                <span className="font-normal text-muted-foreground">(auto)</span>
              </label>
              <input
                id="invoiceNumber"
                className={inputClass}
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelClass} htmlFor="issueDate">
                Date{" "}
                <span className="font-normal text-muted-foreground">(auto)</span>
              </label>
              <input
                id="issueDate"
                type="date"
                className={inputClass}
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelClass} htmlFor="currency">
                Currency
              </label>
              <select
                id="currency"
                className={inputClass}
                value={currency}
                onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelClass} htmlFor="taxRate">
                Tax rate (%)
              </label>
              <input
                id="taxRate"
                type="number"
                min={0}
                step="any"
                className={inputClass}
                value={taxRate}
                onChange={(e) => setTaxRate(Number(e.target.value))}
              />
            </div>
          </div>
        </section>

        {/* Line items */}
        <section className="rounded-2xl border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold tracking-tight">Items</h2>
            <button
              type="button"
              onClick={addItem}
              className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition hover:bg-accent"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Add item
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {items.map((item, index) => (
              <div
                key={index}
                className="grid grid-cols-[1fr_4rem_6rem_auto] items-end gap-2"
              >
                <div className="flex flex-col gap-1">
                  {index === 0 && (
                    <span className="text-xs text-muted-foreground">
                      Description
                    </span>
                  )}
                  <input
                    className={inputClass}
                    value={item.description}
                    onChange={(e) =>
                      updateItem(index, { description: e.target.value })
                    }
                    placeholder="Service or deliverable"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  {index === 0 && (
                    <span className="text-xs text-muted-foreground">Qty</span>
                  )}
                  <input
                    type="number"
                    min={0}
                    step="any"
                    className={inputClass}
                    value={item.quantity}
                    onChange={(e) =>
                      updateItem(index, { quantity: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="flex flex-col gap-1">
                  {index === 0 && (
                    <span className="text-xs text-muted-foreground">Rate</span>
                  )}
                  <input
                    type="number"
                    min={0}
                    step="any"
                    className={inputClass}
                    value={item.unitPrice}
                    onChange={(e) =>
                      updateItem(index, { unitPrice: Number(e.target.value) })
                    }
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeItem(index)}
                  disabled={items.length === 1}
                  aria-label="Remove item"
                  className="rounded-lg p-2 text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-40"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="mt-4 flex justify-end text-sm">
            <span className="text-muted-foreground">Total:&nbsp;</span>
            <span className="font-semibold">
              {formatMoney(totals.total, currency)}
            </span>
          </div>
        </section>

        {/* Payment details */}
        <section className="rounded-2xl border bg-card p-6 shadow-sm">
          <h2 className="text-base font-semibold tracking-tight">
            Payment details
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The provider&apos;s bank details, printed on the invoice so they can
            be paid.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {PAYMENT_FIELDS.map((f) => (
              <div key={f.key} className="flex flex-col gap-1.5">
                <label className={labelClass} htmlFor={f.key}>
                  {f.label}
                </label>
                <input
                  id={f.key}
                  className={inputClass}
                  value={payment[f.key]}
                  onChange={(e) => updatePayment(f.key, e.target.value)}
                />
              </div>
            ))}
          </div>
        </section>

        {/* Notes */}
        <section className="rounded-2xl border bg-card p-6 shadow-sm">
          <label className={labelClass} htmlFor="notes">
            Notes
          </label>
          <textarea
            id="notes"
            className={`${inputClass} mt-2 min-h-20 resize-y`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything else to print on the invoice…"
          />
        </section>
      </div>

      {/* ------------------------------------------------------------- Preview */}
      <div className="xl:sticky xl:top-6 xl:self-start">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">
            Live preview
          </span>
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-60"
          >
            <DownloadIcon className="h-4 w-4" />
            {downloading ? "Preparing…" : "Download PDF"}
          </button>
        </div>
        <div className="mt-3">
          <InvoicePdfPreview data={data} />
        </div>
      </div>
    </div>
  );
}
