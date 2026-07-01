"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import {
  createPettyCashEntry,
  type PettyCashState,
} from "@/app/(dashboard)/billing/actions";

const inputClass =
  "w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring";
const labelClass = "text-sm font-medium";
const initial: PettyCashState = { error: null, success: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-60"
    >
      {pending ? "Recording…" : "Record payment"}
    </button>
  );
}

/**
 * Petty cash quick-entry — deliberately three fields: amount (₹), who it was
 * paid to, and the reason. No currency picker, no category, no file upload;
 * the date is stamped automatically. Resets itself after a successful save.
 */
export function PettyCashForm() {
  const [state, formAction] = useActionState(createPettyCashEntry, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="rounded-2xl border bg-card p-6 shadow-sm"
    >
      <h2 className="text-base font-semibold tracking-tight">Record a payment</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Amount, who it was paid to, and why. That&apos;s it.
      </p>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <label className={labelClass} htmlFor="amount">
            Amount (₹)
          </label>
          <input
            id="amount"
            name="amount"
            type="number"
            min={0}
            step="any"
            required
            placeholder="0.00"
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={labelClass} htmlFor="paid_to">
            To
          </label>
          <input
            id="paid_to"
            name="paid_to"
            required
            placeholder="Who was paid"
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={labelClass} htmlFor="description">
            Reason
          </label>
          <input
            id="description"
            name="description"
            required
            placeholder="What it was for"
            className={inputClass}
          />
        </div>
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
        <SubmitButton />
      </div>
    </form>
  );
}
