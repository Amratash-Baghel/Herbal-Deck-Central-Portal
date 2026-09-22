"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { logDone, moveTask } from "@/app/(dashboard)/tasks/actions";

/** The time column and the text column, shared by every row of the sheet. */
export const ROW = "grid grid-cols-[3.25rem_1fr] md:grid-cols-[4rem_1fr]";
export const TIME =
  "border-r pt-2.5 pr-3 text-right text-xs tabular-nums text-muted-foreground";

/**
 * The last row of the sheet: type what you just finished, press Enter, it
 * becomes the line above and this row empties for the next one.
 *
 * One insert — no status to pick, no column to drag. People were writing their
 * whole day here anyway and clicking three times per line to do it.
 */
export function NewLine({ first }: { first: boolean }) {
  const router = useRouter();
  const box = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || pending) return;
    setError(null);
    start(async () => {
      const res = await logDone(trimmed);
      if (res.ok) {
        setTitle("");
        router.refresh();
        box.current?.focus();
      } else {
        setError(res.error ?? "Could not save that line.");
      }
    });
  }

  return (
    <li className={`${ROW} rounded-r-lg transition-colors focus-within:bg-accent/60`}>
      <span className={`${TIME} border-dashed text-primary/70 dark:text-ring/70`} aria-hidden>
        now
      </span>
      <form onSubmit={submit} className="pl-4">
        <input
          ref={box}
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setError(null);
          }}
          disabled={pending}
          maxLength={200}
          aria-label="Write what you just finished"
          placeholder={
            first ? "What did you just finish?" : "Next line — press Enter to log it"
          }
          className="w-full bg-transparent py-2 text-base leading-snug outline-none placeholder:text-muted-foreground disabled:opacity-60 md:text-lg"
        />
        {error && <p className="pb-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
      </form>
    </li>
  );
}

/**
 * Finishes an open line. The stamp lands in the time column on the left — the
 * only thing that changes, because on this sheet the time *is* the status.
 */
export function StampDone({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="flex shrink-0 items-center gap-2">
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          start(async () => {
            const res = await moveTask(id, "done");
            if (res.ok) router.refresh();
            else setError(res.error ?? "Could not update this line.");
          });
        }}
        className="rounded-lg border px-2 py-0.5 text-xs font-medium text-muted-foreground transition hover:border-primary hover:bg-primary hover:text-primary-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
      >
        {pending ? "Saving…" : "Done"}
      </button>
    </span>
  );
}
