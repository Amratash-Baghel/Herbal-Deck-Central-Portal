"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  setUserDepartments,
  type MutationState,
} from "@/app/(dashboard)/employees/actions";
import { DepartmentCheckboxes } from "@/components/department-checkboxes";
import type { Department } from "@/lib/types";

const initialState: MutationState = { error: null, success: null };

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
    >
      {pending ? "Saving…" : "Save"}
    </button>
  );
}

/**
 * Inline editor for a single user's department memberships. Collapsed by
 * default; expands to a checkbox list bound to the setUserDepartments action.
 */
export function EditUserDepartments({
  userId,
  departments,
  selectedIds,
}: {
  userId: string;
  departments: Department[];
  selectedIds: string[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(setUserDepartments, initialState);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      >
        Edit departments
      </button>
    );
  }

  return (
    <form action={formAction} className="mt-2 w-full rounded-xl border bg-muted/40 p-3">
      <input type="hidden" name="user_id" value={userId} />
      <DepartmentCheckboxes departments={departments} selectedIds={selectedIds} />

      {state.error && (
        <p role="alert" className="mt-2 text-xs text-red-700 dark:text-red-300">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="mt-2 text-xs text-primary">
          {state.success}
        </p>
      )}

      <div className="mt-3 flex items-center gap-2">
        <SaveButton />
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          Close
        </button>
      </div>
    </form>
  );
}
