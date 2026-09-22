"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { moveTask } from "@/app/(dashboard)/tasks/actions";
import type { TaskStatus } from "@/lib/types";

/**
 * One open task on the dashboard, with the single action that moves it forward:
 * "Start" for something waiting, "Mark done" for something in progress. The
 * dashboard only ever lists tasks assigned to the signed-in person, so the
 * assignee check inside `moveTask` always passes here.
 */
export function TaskRow({
  id,
  title,
  dotClass,
  to,
  actionLabel,
  meta,
  href,
}: {
  id: string;
  title: string;
  /** Sticky-note classes from `noteColor()` — the same hue the board uses. */
  dotClass: string;
  to: TaskStatus;
  actionLabel: string;
  meta?: string | null;
  href: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    startTransition(async () => {
      const res = await moveTask(id, to);
      if (res.ok) router.refresh();
      else setError(res.error ?? "Could not update this task.");
    });
  }

  return (
    <li className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-accent">
      <span
        className={`h-2.5 w-2.5 shrink-0 rounded-full border ${dotClass}`}
        aria-hidden="true"
      />
      <a
        href={href}
        className="min-w-0 flex-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="block truncate text-sm">{title}</span>
        {(error || meta) && (
          <span
            className={`block truncate text-xs ${
              error ? "text-red-600 dark:text-red-400" : "text-muted-foreground"
            }`}
          >
            {error ?? meta}
          </span>
        )}
      </a>
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="shrink-0 rounded-lg border px-2.5 py-1 text-xs font-medium transition hover:bg-primary hover:text-primary-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        {pending ? "Saving…" : actionLabel}
      </button>
    </li>
  );
}
