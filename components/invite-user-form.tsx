"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { inviteUser, type InviteState } from "@/app/(dashboard)/users/actions";
import { DepartmentCheckboxes } from "@/components/department-checkboxes";
import type { Department } from "@/lib/types";

const initialState: InviteState = { error: null, success: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60"
    >
      {pending ? "Adding…" : "Add employee"}
    </button>
  );
}

const inputClass =
  "rounded-xl border bg-background px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring";

export function InviteUserForm({ departments }: { departments: Department[] }) {
  const [state, formAction] = useActionState(inviteUser, initialState);
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
      <h2 className="text-base font-semibold tracking-tight">Add an employee</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Creates an account and sets a temporary password to share with them.
      </p>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="full_name" className="text-sm font-medium">
            Full name
          </label>
          <input id="full_name" name="full_name" type="text" required className={inputClass} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <input id="email" name="email" type="email" required className={inputClass} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="role" className="text-sm font-medium">
            Account role
          </label>
          <select id="role" name="role" defaultValue="employee" className={inputClass}>
            <option value="employee">Employee</option>
            <option value="admin">Admin (owner-level)</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-sm font-medium">
            Temporary password
          </label>
          <input
            id="password"
            name="password"
            type="text"
            required
            minLength={8}
            placeholder="At least 8 characters"
            className={inputClass}
          />
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <span className="text-sm font-medium">Departments</span>
        <p className="text-xs text-muted-foreground">
          Select one or more. Members of HR &amp; Management gain billing and
          staff-management authority.
        </p>
        <DepartmentCheckboxes departments={departments} />
      </div>

      {state.error && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="mt-4 rounded-lg bg-accent px-3 py-2 text-sm text-primary">
          {state.success}
        </p>
      )}

      <div className="mt-5">
        <SubmitButton />
      </div>
    </form>
  );
}
