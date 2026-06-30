"use client";

import { useState } from "react";
import { saveEodNote } from "@/app/(dashboard)/tasks/actions";

/**
 * The optional note an employee adds to today's auto-generated EOD before it
 * finalises. Saving snapshots the day's activity counts alongside the note.
 */
export function EodNoteForm({
  initialNote,
  alreadySubmitted,
}: {
  initialNote: string;
  alreadySubmitted: boolean;
}) {
  const [note, setNote] = useState(initialNote);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(alreadySubmitted);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await saveEodNote(note);
    setBusy(false);
    if (res.ok) setSaved(true);
    else setError(res.error ?? "Could not save your report.");
  }

  return (
    <div className="mt-4">
      <label className="text-xs font-medium text-muted-foreground" htmlFor="eod-note">
        Add a note to your end-of-day report (optional)
      </label>
      <textarea
        id="eod-note"
        value={note}
        onChange={(e) => {
          setNote(e.target.value);
          setSaved(false);
        }}
        placeholder="Anything worth flagging — blockers, wins, what's next…"
        className="mt-1.5 min-h-20 w-full resize-y rounded-xl border bg-background px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
      />
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-60"
        >
          {busy ? "Saving…" : saved ? "Update report" : "Submit report"}
        </button>
        {saved && !busy && (
          <span className="text-sm text-primary">Saved for today.</span>
        )}
        {error && <span className="text-sm text-red-600 dark:text-red-400">{error}</span>}
      </div>
    </div>
  );
}
