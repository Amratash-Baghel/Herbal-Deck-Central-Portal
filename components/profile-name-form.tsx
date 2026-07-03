"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { updateName, type NameState } from "@/app/(dashboard)/profile/actions";

const initial: NameState = { error: null, success: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-60"
    >
      {pending ? "Saving…" : "Save"}
    </button>
  );
}

/** Edit your own display name (also updates the sidebar). */
export function ProfileNameForm({ fullName }: { fullName: string | null }) {
  const [state, formAction] = useActionState(updateName, initial);

  return (
    <form action={formAction} className="space-y-2">
      <label htmlFor="full_name" className="text-xs font-medium text-muted-foreground">
        Full name
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          id="full_name"
          name="full_name"
          type="text"
          required
          defaultValue={fullName ?? ""}
          maxLength={100}
          className="min-w-0 flex-1 rounded-xl border bg-background px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
        />
        <SubmitButton />
      </div>
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
