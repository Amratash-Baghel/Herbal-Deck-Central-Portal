"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
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
      className="rounded-xl border px-4 py-2 text-sm font-medium transition hover:bg-accent disabled:opacity-60"
    >
      {pending ? "Sending…" : "Email me a reset link"}
    </button>
  );
}

/**
 * Change-password control, relocated here from the sidebar. Emails the signed-in
 * user a secure link to set a new password (the link lands on /auth/confirm →
 * /reset-password). The email is fixed to the current account.
 */
export function ChangePasswordCard({ email }: { email: string }) {
  const [state, formAction] = useActionState(requestPasswordReset, initial);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="email" value={email} />
      <p className="text-sm text-muted-foreground">
        We&apos;ll email <span className="font-medium text-foreground">{email}</span>{" "}
        a secure link to set a new password.
      </p>
      <SubmitButton />
      {state.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="text-sm text-primary">
          {state.success}
        </p>
      )}
    </form>
  );
}
