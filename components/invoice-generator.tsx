"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import {
  computeTotals,
  downloadInvoicePdf,
  type InvoiceData,
  type InvoiceLineItem,
} from "@/lib/invoice-pdf";
import { CURRENCIES, formatMoney, type CurrencyCode } from "@/lib/money";
import { DownloadIcon, PlusIcon, TrashIcon } from "@/components/icons";
import {
  postInvoice,
  type PostInvoiceState,
} from "@/app/(dashboard)/billing/actions";

const inputClass =
  "w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring";
const labelClass = "text-sm font-medium";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function suggestNumber(): string {
  const year = new Date().getFullYear();
  const n = Math.floor(1000 + Math.random() * 9000);
  return `HD-${year}-${n}`;
}

const postInitial: PostInvoiceState = { error: null, success: null };

function PostButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-60"
    >
      {pending ? "Posting…" : "Post invoice"}
    </button>
  );
}

/**
 * Invoice generator: a form on the left, a live "paper" preview on the right,
 * a one-click Download (PDF built in the browser), and a panel to "post" the
 * invoice into expense tracking under the employee's name and department.
 */
export function InvoiceGenerator({
  employeeName,
  departments,
  categories,
}: {
  employeeName: string;
  departments: { id: string; name: string }[];
  categories: { id: string; name: string }[];
}) {
  // The invoice is raised on behalf of a service provider (who gets paid), and
  // billed to the company — so "From" defaults to the provider, "Bill to" to us.
  const [fromName, setFromName] = useState("");
  const [fromDetails, setFromDetails] = useState("");
  const [toName, setToName] = useState("Herbal Deck");
  const [toDetails, setToDetails] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState(suggestNumber);
  const [issueDate, setIssueDate] = useState(todayIso);
  const [dueDate, setDueDate] = useState(() => addDaysIso(14));
  const [currency, setCurrency] = useState<CurrencyCode>("INR");
  const [taxRate, setTaxRate] = useState(0);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<InvoiceLineItem[]>([
    { description: "", quantity: 1, unitPrice: 0 },
  ]);
  const [downloading, setDownloading] = useState(false);

  const [postState, postAction] = useActionState(postInvoice, postInitial);

  function updateItem(index: number, patch: Partial<InvoiceLineItem>) {
    setItems((prev) =>
      prev.map((it, i) => (i === index ? { ...it, ...patch } : it)),
    );
  }
  function addItem() {
    setItems((prev) => [...prev, { description: "", quantity: 1, unitPrice: 0 }]);
  }
  function removeItem(index: number) {
    setItems((prev) =>
      prev.length > 1 ? prev.filter((_, i) => i !== index) : prev,
    );
  }

  const data: InvoiceData = useMemo(
    () => ({
      fromName,
      fromDetails,
      toName,
      toDetails,
      invoiceNumber,
      issueDate,
      dueDate,
      currency,
      items,
      taxRate,
      notes,
    }),
    [
      fromName,
      fromDetails,
      toName,
      toDetails,
      invoiceNumber,
      issueDate,
      dueDate,
      currency,
      items,
      taxRate,
      notes,
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
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[1fr_1.05fr]">
        {/* -------------------------------------------------------------- Form */}
        <div className="space-y-6">
          {/* Parties */}
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
                  placeholder="Provider / vendor name"
                />
                <textarea
                  className={`${inputClass} min-h-20 resize-y`}
                  value={fromDetails}
                  onChange={(e) => setFromDetails(e.target.value)}
                  placeholder={"Address line\nEmail · Phone\nGSTIN / Tax ID"}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelClass} htmlFor="toName">
                  Bill to (your company)
                </label>
                <input
                  id="toName"
                  className={inputClass}
                  value={toName}
                  onChange={(e) => setToName(e.target.value)}
                  placeholder="Company name"
                />
                <textarea
                  className={`${inputClass} min-h-20 resize-y`}
                  value={toDetails}
                  onChange={(e) => setToDetails(e.target.value)}
                  placeholder={"Address line\nEmail · Phone\nGSTIN / Tax ID"}
                />
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
                  Invoice number
                </label>
                <input
                  id="invoiceNumber"
                  className={inputClass}
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
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
                <label className={labelClass} htmlFor="issueDate">
                  Issue date
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
                <label className={labelClass} htmlFor="dueDate">
                  Due date
                </label>
                <input
                  id="dueDate"
                  type="date"
                  className={inputClass}
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
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
                      placeholder="Service or product"
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
                      <span className="text-xs text-muted-foreground">
                        Price
                      </span>
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

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
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

            <div className="mt-4 flex flex-col gap-1.5">
              <label className={labelClass} htmlFor="notes">
                Notes / payment terms
              </label>
              <textarea
                id="notes"
                className={`${inputClass} min-h-20 resize-y`}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Bank details, payment terms, thank-you note…"
              />
            </div>
          </section>
        </div>

        {/* ----------------------------------------------------------- Preview */}
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

          {/* The preview is always "paper" (light), since that is what prints. */}
          <div className="mt-3 overflow-hidden rounded-2xl border bg-white text-zinc-800 shadow-sm">
            <div className="p-7 text-[13px] leading-relaxed">
              {/* Header */}
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xl font-bold text-[#1a5c38]">
                    {fromName || "Service provider"}
                  </p>
                  <p className="mt-1 whitespace-pre-line text-xs text-zinc-500">
                    {fromDetails}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-2xl font-bold tracking-tight text-zinc-900">
                    INVOICE
                  </p>
                  <p className="mt-1 text-xs text-zinc-500"># {invoiceNumber}</p>
                  <p className="text-xs text-zinc-500">
                    Issued: {issueDate || "—"}
                  </p>
                  <p className="text-xs text-zinc-500">Due: {dueDate || "—"}</p>
                </div>
              </div>

              <div className="my-4 h-0.5 bg-[#1a5c38]" />

              {/* Bill to */}
              <p className="text-xs font-semibold uppercase tracking-wide text-[#1a5c38]">
                Bill to
              </p>
              <p className="mt-1 font-semibold text-zinc-900">{toName || "—"}</p>
              <p className="whitespace-pre-line text-xs text-zinc-500">
                {toDetails}
              </p>

              {/* Items */}
              <table className="mt-5 w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-[#1a5c38] text-white">
                    <th className="px-2 py-2 text-left font-semibold">#</th>
                    <th className="px-2 py-2 text-left font-semibold">
                      Description
                    </th>
                    <th className="px-2 py-2 text-right font-semibold">Qty</th>
                    <th className="px-2 py-2 text-right font-semibold">
                      Unit Price
                    </th>
                    <th className="px-2 py-2 text-right font-semibold">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr key={index} className="border-b border-zinc-100">
                      <td className="px-2 py-2">{index + 1}</td>
                      <td className="px-2 py-2">{item.description || "—"}</td>
                      <td className="px-2 py-2 text-right">{item.quantity}</td>
                      <td className="px-2 py-2 text-right">
                        {formatMoney(item.unitPrice, currency)}
                      </td>
                      <td className="px-2 py-2 text-right">
                        {formatMoney(
                          (Number(item.quantity) || 0) *
                            (Number(item.unitPrice) || 0),
                          currency,
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Totals */}
              <div className="mt-4 flex justify-end">
                <div className="w-56 space-y-1.5">
                  <div className="flex justify-between text-zinc-500">
                    <span>Subtotal</span>
                    <span className="text-zinc-900">
                      {formatMoney(totals.subtotal, currency)}
                    </span>
                  </div>
                  {taxRate > 0 && (
                    <div className="flex justify-between text-zinc-500">
                      <span>Tax ({taxRate}%)</span>
                      <span className="text-zinc-900">
                        {formatMoney(totals.tax, currency)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-zinc-200 pt-1.5 text-base font-bold text-zinc-900">
                    <span>Total</span>
                    <span>{formatMoney(totals.total, currency)}</span>
                  </div>
                </div>
              </div>

              {/* Notes */}
              {notes.trim() && (
                <div className="mt-6">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#1a5c38]">
                    Notes
                  </p>
                  <p className="mt-1 whitespace-pre-line text-xs text-zinc-500">
                    {notes}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* --------------------------------------------------- Post to tracking */}
      <section className="rounded-2xl border bg-card p-6 shadow-sm">
        <h2 className="text-base font-semibold tracking-tight">
          Post to expense tracking
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Records this invoice under your name in the chosen department. It then
          awaits the owner&apos;s signature and management clearing.
        </p>

        <form action={postAction} className="mt-5 space-y-4">
          <input type="hidden" name="document" value={JSON.stringify(data)} />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <span className={labelClass}>Posted by</span>
              <div className="rounded-xl border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                {employeeName}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className={labelClass}>Department</span>
              {departments.length === 0 ? (
                <p className="rounded-xl border border-dashed px-3 py-2 text-xs text-red-700 dark:text-red-300">
                  You&apos;re not in a department yet — ask an admin to add you.
                </p>
              ) : departments.length === 1 ? (
                <>
                  <input
                    type="hidden"
                    name="department_id"
                    value={departments[0].id}
                  />
                  <div className="rounded-xl border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                    {departments[0].name}
                  </div>
                </>
              ) : (
                <select
                  name="department_id"
                  className={inputClass}
                  defaultValue={departments[0].id}
                >
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className={labelClass} htmlFor="category_id">
                Category
              </label>
              <select id="category_id" name="category_id" className={inputClass} defaultValue="">
                <option value="">No category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={labelClass} htmlFor="reason">
              Reason for posting
            </label>
            <textarea
              id="reason"
              name="reason"
              required
              className={`${inputClass} min-h-16 resize-y`}
              placeholder="e.g. Monthly retainer for the video editing vendor"
            />
          </div>

          {postState.error && (
            <p
              role="alert"
              className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
            >
              {postState.error}
            </p>
          )}
          {postState.success && (
            <p
              role="status"
              className="rounded-lg bg-accent px-3 py-2 text-sm text-primary"
            >
              {postState.success}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-4">
            <PostButton disabled={departments.length === 0} />
            <Link
              href="/billing/invoices"
              className="text-sm font-medium text-primary hover:underline"
            >
              View posted invoices →
            </Link>
          </div>
        </form>
      </section>
    </div>
  );
}
