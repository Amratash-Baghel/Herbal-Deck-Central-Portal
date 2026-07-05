import { daysUntil, formatDuration, formatMs } from "@/lib/time";
import { completedOnTime, type TaskLite, type TaskStats } from "@/lib/reporting";

/** A single headline metric. */
function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "danger" | "good";
}) {
  const valueTone =
    tone === "danger"
      ? "text-red-600 dark:text-red-400"
      : tone === "good"
        ? "text-emerald-600 dark:text-emerald-400"
        : "";
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tracking-tight ${valueTone}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Met-vs-missed deadline bar, with a currently-overdue callout. */
function DeadlineScorecard({ stats }: { stats: TaskStats }) {
  if (stats.deadlineOutcomes === 0) {
    return (
      <div className="rounded-2xl border bg-card p-4 shadow-sm">
        <p className="text-sm font-medium">Deadline reliability</p>
        <p className="mt-1 text-sm text-muted-foreground">
          No deadline-bearing tasks have come due yet.
        </p>
      </div>
    );
  }
  const metPct = Math.round((stats.metDeadline / stats.deadlineOutcomes) * 100);
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">Deadline reliability</p>
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{stats.onTimeRate}%</span> on time ·{" "}
          {stats.metDeadline} met · {stats.missedDeadline} missed
        </p>
      </div>
      <div className="mt-2.5 flex h-2.5 overflow-hidden rounded-full bg-muted">
        <div className="bg-emerald-500" style={{ width: `${metPct}%` }} />
        <div className="bg-red-500" style={{ width: `${100 - metPct}%` }} />
      </div>
      {stats.overdue > 0 && (
        <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">
          {stats.overdue} task{stats.overdue === 1 ? "" : "s"} currently overdue.
        </p>
      )}
    </div>
  );
}

/** Overdue → red, due soon → amber, later → muted, none → subtle. */
function DeadlinePill({ deadline }: { deadline: string | null }) {
  const days = daysUntil(deadline);
  if (days === null) {
    return <span className="text-[11px] text-muted-foreground/70">No deadline</span>;
  }
  let label: string;
  let tone: string;
  if (days < 0) {
    label = `${-days}d overdue`;
    tone = "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300";
  } else if (days === 0) {
    label = "Due today";
    tone = "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300";
  } else if (days <= 2) {
    label = `${days}d left`;
    tone = "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300";
  } else {
    label = `${days}d left`;
    tone = "bg-muted text-muted-foreground";
  }
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${tone}`}>
      {label}
    </span>
  );
}

function fmtShortDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

/**
 * The task half of an Employee Review: headline performance, a deadline-
 * reliability scorecard, and clean lists of what's completed and what's still
 * open — replacing the old flat, meaningless activity dump. `open` is expected
 * sorted overdue-first; `completed` most-recent-first.
 */
export function EmployeeTaskReport({
  stats,
  open,
  completed,
  windowDays,
  tz = "Asia/Kolkata",
}: {
  stats: TaskStats;
  open: TaskLite[];
  completed: TaskLite[];
  windowDays: number;
  tz?: string;
}) {
  const LIMIT = 20;
  const avgTime = formatMs(stats.avgCompletionMs) ?? "—";

  return (
    <section className="mb-8">
      <h2 className="mb-3 text-base font-semibold tracking-tight">Task performance</h2>

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Completed" value={String(stats.completed)} hint={`in ${windowDays} days`} />
        <Stat
          label="Open now"
          value={String(stats.open)}
          hint={stats.overdue > 0 ? `${stats.overdue} overdue` : "none overdue"}
          tone={stats.overdue > 0 ? "danger" : undefined}
        />
        <Stat
          label="On-time rate"
          value={stats.onTimeRate === null ? "—" : `${stats.onTimeRate}%`}
          hint={
            stats.deadlineOutcomes
              ? `${stats.missedDeadline} of ${stats.deadlineOutcomes} missed`
              : "no deadlines yet"
          }
          tone={
            stats.onTimeRate === null
              ? undefined
              : stats.onTimeRate >= 80
                ? "good"
                : stats.onTimeRate < 50
                  ? "danger"
                  : undefined
          }
        />
        <Stat label="Avg time to complete" value={avgTime} hint="start → done" />
      </div>

      <div className="mb-4">
        <DeadlineScorecard stats={stats} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Completed */}
        <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <h3 className="text-sm font-semibold">Completed tasks</h3>
            <span className="text-xs text-muted-foreground">{stats.completed}</span>
          </div>
          <ul className="divide-y">
            {completed.slice(0, LIMIT).map((t) => {
              const onTime = completedOnTime(t, tz);
              const took = formatDuration(t.started_at ?? t.created_at, t.completed_at);
              return (
                <li key={t.id} className="flex items-start gap-2 px-4 py-2.5 text-sm">
                  <span className="mt-0.5 shrink-0 text-emerald-500">✓</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-foreground/90">{t.title}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
                      {t.completed_at && <span>{fmtShortDate(t.completed_at)}</span>}
                      {took && <span>· {took}</span>}
                      {onTime === false && (
                        <span className="rounded-full bg-red-100 px-1.5 py-0.5 font-medium text-red-700 dark:bg-red-950/50 dark:text-red-300">
                          late
                        </span>
                      )}
                      {onTime === true && (
                        <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                          on time
                        </span>
                      )}
                    </span>
                  </span>
                </li>
              );
            })}
            {completed.length === 0 && (
              <li className="px-4 py-8 text-center text-sm text-muted-foreground">
                Nothing completed in the last {windowDays} days.
              </li>
            )}
            {completed.length > LIMIT && (
              <li className="px-4 py-2 text-center text-xs text-muted-foreground">
                + {completed.length - LIMIT} more
              </li>
            )}
          </ul>
        </div>

        {/* Open */}
        <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <h3 className="text-sm font-semibold">Open tasks</h3>
            <span className="text-xs text-muted-foreground">
              {stats.open}
              {stats.overdue > 0 && (
                <span className="text-red-600 dark:text-red-400"> · {stats.overdue} overdue</span>
              )}
            </span>
          </div>
          <ul className="divide-y">
            {open.slice(0, LIMIT).map((t) => (
              <li key={t.id} className="flex items-center gap-2 px-4 py-2.5 text-sm">
                <span className="min-w-0 flex-1 truncate text-foreground/90">{t.title}</span>
                <DeadlinePill deadline={t.deadline} />
              </li>
            ))}
            {open.length === 0 && (
              <li className="px-4 py-8 text-center text-sm text-muted-foreground">
                No open tasks — all caught up.
              </li>
            )}
            {open.length > LIMIT && (
              <li className="px-4 py-2 text-center text-xs text-muted-foreground">
                + {open.length - LIMIT} more
              </li>
            )}
          </ul>
        </div>
      </div>
    </section>
  );
}
