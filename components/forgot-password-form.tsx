"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import {
  requestPasswordReset,
  type ResetRequestState,
} from "@/app/forgot-password/actions";

const initial: ResetRequestState = { error: null, success: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-2 w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60"
    >
      {pending ? "Sending…" : "Send reset link"}
    </button>
  );
}

/**
 * Request-a-reset form. Emails the account a recovery link; works whether the
 * person is signed in (changing their password) or locked out (forgot it). The
 * email is pre-filled when we already know who's asking.
 */
export function ForgotPasswordForm({ defaultEmail }: { defaultEmail?: string }) {
  const [state, formAction] = useActionState(requestPasswordReset, initial);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium">
          Account email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={defaultEmail}
          placeholder="you@herbaldeck.com"
          className="rounded-xl border bg-background px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      {state.error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
        >
          {state.error}
        </p>
      )}
      {state.success && (
        <p
          role="status"
          className="rounded-lg bg-accent px-3 py-2 text-sm text-primary"
        >
          {state.success}
        </p>
      )}

      {!state.success && <SubmitButton />}

      <Link
        href="/login"
        className="text-center text-xs text-muted-foreground transition hover:text-foreground"
      >
        Back to sign in
      </Link>
    </form>
  );
}
