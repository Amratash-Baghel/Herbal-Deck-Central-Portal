"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createTask } from "@/app/(dashboard)/tasks/actions";

/**
 * One field, one Enter, task on your list. `createTask` already defaults the
 * assignee to the signed-in person and the department to their first one, so
 * a title is the only thing worth asking for here.
 */
export function QuickAdd() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || pending) return;
    setError(null);
    startTransition(async () => {
      const res = await createTask({ title: trimmed });
      if (res.ok) {
        setTitle("");
        router.refresh();
      } else {
        setError(res.error ?? "Could not add that task.");
      }
    });
  }

  return (
    <form onSubmit={submit} className="mt-3">
      <div className="flex items-center gap-2 rounded-xl border bg-background px-3 py-2 transition focus-within:ring-2 focus-within:ring-ring">
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setError(null);
          }}
          placeholder="Add something to your list"
          aria-label="Add a task"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        {title.trim() && (
          <button
            type="submit"
            disabled={pending}
            className="shrink-0 rounded-lg bg-primary px-3 py-1 text-xs font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
          >
            {pending ? "Adding…" : "Add"}
          </button>
        )}
      </div>
      {error && <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </form>
  );
}
