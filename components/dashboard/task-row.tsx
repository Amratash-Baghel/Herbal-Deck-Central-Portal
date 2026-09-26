"use client";

import { useState, useTransition } from "react";
import { moveTask } from "@/app/(dashboard)/tasks/actions";
import type { TaskStatus } from "@/lib/types";

/**
 * One open task on the dashboard, with the single action that moves it forward:
 * "Start" for something waiting, "Mark done" for something in progress. The
 * dashboard only ever lists tasks assigned to the signed-in person, so the
 * assignee check inside `moveTask` always passes here.
 *
 * The button is always visible and sized for a thumb rather than revealed on
 * hover — on a phone there is no hover, and this is the one control that makes
 * the row worth reading.
 *
 * `moveTask` revalidates, so its response already carries the re-rendered
 * dashboard — no router.refresh() (which rendered it a second time).
 */
export function TaskRow({ id, title, dotClass, to, actionLabel, meta, href }: {
  id: string; title: string;
  /** Sticky-note classes from `noteColor()` — the same hue the board uses. */
  dotClass: string; to: TaskStatus; actionLabel: string;
  meta?: string | null; href: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    startTransition(async () => {
      const res = await moveTask(id, to);
      if (!res.ok) setError(res.error ?? "Could not update this task.");
    });
  }

  return (
    <li className="flex items-center gap-3 px-4 py-2 transition-colors hover:bg-accent">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full border ${dotClass}`} aria-hidden="true" />
      <a href={href} className="min-w-0 flex-1 rounded py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="block truncate text-[15px] leading-5">{title}</span>
        {(error || meta) && (
          <span className={`block truncate text-xs ${error ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>
            {error ?? meta}
          </span>
        )}
      </a>
      <button type="button" onClick={run} disabled={pending}
        className="shrink-0 touch-manipulation rounded-lg border px-3 py-2 text-xs font-medium transition-colors hover:border-primary hover:bg-primary hover:text-primary-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
        {pending ? "Saving…" : actionLabel}
      </button>
    </li>
  );
}
