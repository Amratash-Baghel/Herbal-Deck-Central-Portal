"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { dayRangeUTC, formatClockTZ } from "@/lib/time";
import { statusLabel } from "@/lib/tasks";
import type { EodReport, EodSummary, TaskActivity } from "@/lib/types";

const ZERO: EodSummary = { created: 0, in_progress: 0, completed: 0, pending: 0 };

function fmtDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      });
}

function activityLabel(a: TaskActivity): string {
  const title = a.task_title ? `“${a.task_title}”` : "a task";
  switch (a.action) {
    case "created":
      return `Created ${title}`;
    case "status_changed":
      return a.to_status
        ? `Moved ${title} to ${statusLabel(a.to_status)}`
        : `Updated ${title}`;
    case "assigned":
      return `Reassigned ${title}`;
    case "archived":
      return `Archived ${title}`;
    default:
      return `Updated ${title}`;
  }
}

/**
 * One EOD report: the day's activity counts and the manual note, with a
 * lazily-loaded timeline of the exact task activity for that day. The timeline
 * is fetched through the RLS-scoped browser client, so it works both for an
 * employee viewing their own report and a manager viewing anyone's.
 */
export function EodReportCard({
  report,
  employeeName,
  defaultOpen = false,
}: {
  report: EodReport;
  employeeName?: string;
  defaultOpen?: boolean;
}) {
  const [view, setView] = useState<null | "activity" | "completed">(
    defaultOpen ? "activity" : null,
  );
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<TaskActivity[]>([]);

  const s = report.auto_summary ?? ZERO;
  const completed = items.filter(
    (a) => a.action === "status_changed" && a.to_status === "done",
  );

  async function ensureLoaded() {
    if (loaded || loading) return;
    setLoading(true);
    const supabase = createClient();
    const { startISO, endISO } = dayRangeUTC(report.report_date);
    const { data } = await supabase
      .from("task_activity")
      .select("*")
      .eq("actor_id", report.employee_id)
      .gte("created_at", startISO)
      .lt("created_at", endISO)
      .order("created_at", { ascending: true });
    setItems((data ?? []) as TaskActivity[]);
    setLoaded(true);
    setLoading(false);
  }

  function show(v: "activity" | "completed") {
    setView((cur) => (cur === v ? null : v));
    void ensureLoaded();
  }

  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="text-sm font-medium">
            {employeeName ? `${employeeName} · ` : ""}
            <span className={employeeName ? "font-normal text-muted-foreground" : ""}>
              {fmtDate(report.report_date)}
            </span>
          </span>
        </div>
        <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-primary">
          Submitted
        </span>
      </div>

      <p className="mt-1 text-xs text-muted-foreground">
        {Number(s.created)} created · {Number(s.in_progress)} started ·{" "}
        {Number(s.completed)} completed · {Number(s.pending)} pending
      </p>

      {report.manual_note && (
        <p className="mt-1.5 whitespace-pre-wrap text-sm text-foreground/80">
          {report.manual_note}
        </p>
      )}

      <div className="mt-2 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => show("activity")}
          className="text-xs font-medium text-primary transition hover:underline"
        >
          {view === "activity" ? "Hide activity" : "View activity"}
        </button>
        <button
          type="button"
          onClick={() => show("completed")}
          className="text-xs font-medium text-primary transition hover:underline"
        >
          {view === "completed" ? "Hide completed" : "Completed tasks"}
        </button>
      </div>

      {view === "activity" && (
        <div className="mt-2 border-t pt-2">
          {loading && <p className="py-2 text-xs text-muted-foreground">Loading…</p>}
          {loaded && items.length === 0 && (
            <p className="py-2 text-xs text-muted-foreground">
              No task activity logged for this day.
            </p>
          )}
          <ul className="space-y-1.5">
            {items.map((a) => (
              <li key={a.id} className="flex items-baseline gap-2 text-xs">
                <span className="w-16 shrink-0 tabular-nums text-muted-foreground">
                  {formatClockTZ(a.created_at)}
                </span>
                <span className="text-foreground/80">{activityLabel(a)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {view === "completed" && (
        <div className="mt-2 border-t pt-2">
          {loading && <p className="py-2 text-xs text-muted-foreground">Loading…</p>}
          {loaded && completed.length === 0 && (
            <p className="py-2 text-xs text-muted-foreground">
              No tasks completed this day.
            </p>
          )}
          <ul className="space-y-1">
            {completed.map((a) => (
              <li key={a.id} className="flex items-baseline gap-2 text-xs text-foreground/80">
                <span className="text-primary">✓</span>
                {a.task_title ?? "Untitled task"}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
