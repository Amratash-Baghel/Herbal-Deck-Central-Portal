"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import {
  createPostedInvoice,
  type PostInvoiceState,
} from "@/app/(dashboard)/billing/actions";
import { CURRENCIES } from "@/lib/money";

const inputClass =
  "w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring";
const labelClass = "text-sm font-medium";
const initial: PostInvoiceState = { error: null, success: null };

function SubmitButton({ disabled }: { disabled: boolean }) {
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
 * Form to post an invoice into tracking: the provider, amount, department, a
 * reason, and the (optional) generated/signed PDF. The employee and the
 * permission checks are enforced server-side.
 */
export function PostInvoiceForm({
  departments,
  categories,
}: {
  departments: { id: string; name: string }[];
  categories: { id: string; name: string }[];
}) {
  const [state, formAction] = useActionState(createPostedInvoice, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  const noDept = departments.length === 0;

  return (
    <form
      ref={formRef}
      action={formAction}
      className="rounded-2xl border bg-card p-6 shadow-sm"
    >
      <h2 className="text-base font-semibold tracking-tight">Post an invoice</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Records the invoice under your name for management to clear. Attach the
        PDF now or upload it later.
      </p>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className={labelClass} htmlFor="vendor_name">
            Service provider
          </label>
          <input id="vendor_name" name="vendor_name" required className={inputClass} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Invoice number</label>
          <div className="flex h-[38px] items-center rounded-xl border border-dashed bg-muted/40 px-3 text-sm text-muted-foreground">
            Assigned automatically when posted
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelClass} htmlFor="amount">
            Amount
          </label>
          <input
            id="amount"
            name="amount"
            type="number"
            min={0}
            step="any"
            required
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={labelClass} htmlFor="currency">
            Currency
          </label>
          <select id="currency" name="currency" defaultValue="INR" className={inputClass}>
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelClass} htmlFor="department_id">
            Department
          </label>
          {noDept ? (
            <p className="rounded-xl border border-dashed px-3 py-2 text-xs text-red-700 dark:text-red-300">
              You&apos;re not in a department yet — ask an admin to add you.
            </p>
          ) : (
            <select
              id="department_id"
              name="department_id"
              defaultValue={departments[0].id}
              className={inputClass}
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
          <select id="category_id" name="category_id" defaultValue="" className={inputClass}>
            <option value="">No category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelClass} htmlFor="issue_date">
            Invoice date
          </label>
          <input id="issue_date" name="issue_date" type="date" className={inputClass} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={labelClass} htmlFor="file">
            Invoice PDF{" "}
            <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <input
            id="file"
            name="file"
            type="file"
            accept="application/pdf,image/*"
            className="text-sm file:mr-3 file:rounded-lg file:border file:bg-background file:px-3 file:py-1.5 file:text-xs file:font-medium"
          />
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-1.5">
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

      {state.error && (
        <p
          role="alert"
          className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
        >
          {state.error}
        </p>
      )}
      {state.success && (
        <p
          role="status"
          className="mt-4 rounded-lg bg-accent px-3 py-2 text-sm text-primary"
        >
          {state.success}
        </p>
      )}

      <div className="mt-5">
        <SubmitButton disabled={noDept} />
      </div>
    </form>
  );
}
