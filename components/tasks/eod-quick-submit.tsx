"use client";

import Link from "next/link";
import { useRef } from "react";
import { CloseIcon } from "@/components/icons";
import { EodNoteForm } from "@/components/tasks/eod-note-form";

/**
 * File the end-of-day report without leaving the board. The same form the
 * Reports tab mounts, in a native <dialog> — so today's note comes in already
 * written and saving here is the same server action, same snapshot, same
 * notification to the people who read it.
 */
export function EodQuickSubmit({
  initialNote,
  alreadySubmitted,
}: {
  initialNote: string;
  alreadySubmitted: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        className="shrink-0 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {alreadySubmitted ? "Update report" : "Submit report"}
      </button>

      <dialog
        ref={ref}
        // Clicking the backdrop is the dialog itself; the panel stops it.
        onClick={(e) => {
          if (e.target === ref.current) ref.current?.close();
        }}
        className="m-auto w-[min(34rem,calc(100vw-2rem))] rounded-2xl border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/40"
      >
        <div className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold tracking-tight">
                End-of-day report
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {alreadySubmitted
                  ? "Filed for today — edit the note and save again."
                  : "Your task activity is counted automatically. Add anything worth flagging."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => ref.current?.close()}
              aria-label="Close"
              className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <CloseIcon />
            </button>
          </div>

          <EodNoteForm initialNote={initialNote} alreadySubmitted={alreadySubmitted} />

          <Link
            href="/tasks/reports"
            className="mt-4 inline-block text-xs font-medium text-muted-foreground underline-offset-4 transition hover:text-foreground hover:underline"
          >
            Open the Reports tab &rarr;
          </Link>
        </div>
      </dialog>
    </>
  );
}
