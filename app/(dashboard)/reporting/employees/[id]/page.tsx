import Link from "next/link";
import { notFound } from "next/navigation";
import { getUserAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { EodReportCard } from "@/components/reporting/eod-report-card";
import { EmployeeTaskReport } from "@/components/reporting/employee-task-report";
import { computeTaskStats, TASK_STAT_COLUMNS, type TaskLite } from "@/lib/reporting";
import { buildAttendance, summarize, monthBounds, dateRange } from "@/lib/attendance";
import {
  localDateISO,
  isoDaysAgo,
  formatClockTZ,
  formatDuration,
  hourInTZ,
} from "@/lib/time";
import type { ActivityLog, EodReport } from "@/lib/types";

const WINDOW_DAYS = 45;
const TZ = "Asia/Kolkata";

function istMinutes(iso: string): number | null {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const h = Number(parts.find((p) => p.type === "hour")?.value);
  const m = Number(parts.find((p) => p.type === "minute")?.value);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function fmtClock12(mins: number): string {
  const h24 = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  const period = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

function fmtHourRange(h: number): string {
  const label = (x: number) => {
    const hh = x % 24;
    const period = hh < 12 ? "AM" : "PM";
    const h12 = hh % 12 === 0 ? 12 : hh % 12;
    return `${h12} ${period}`;
  };
  return `${label(h)} – ${label(h + 1)}`;
}

function fmtDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * Employee Review — a complete picture of one person (admins + HR & Management):
 * their passive attendance (arrive/leave/active-for per day), full task history
 * with timestamps, EOD report history, and summary stats. Data is drawn over the
 * last ~6 weeks. RLS on every table independently confines this to managers.
 */
export default async function EmployeeReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const since = localDateISO(TZ, new Date(isoDaysAgo(WINDOW_DAYS)));
  const sinceTs = isoDaysAgo(WINDOW_DAYS);

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, email, post")
    .eq("id", id)
    .maybeSingle();
  if (!profile) notFound();
  const p = profile as {
    id: string;
    full_name: string | null;
    email: string;
    post: string | null;
  };
  const name = p.full_name || p.email;

  const [
    { data: membs },
    { data: depts },
    { data: activity },
    { data: reports },
    { data: taskActs },
    { data: openRows },
    { data: doneRows },
  ] = await Promise.all([
    supabase.from("profile_departments").select("department_id").eq("profile_id", id),
    supabase.from("departments").select("id, name"),
    supabase
      .from("activity_logs")
      .select("*")
      .eq("employee_id", id)
      .gte("date", since)
      .order("date", { ascending: false }),
    supabase
      .from("eod_reports")
      .select("*")
      .eq("employee_id", id)
      .order("report_date", { ascending: false })
      .limit(60),
    // Just the timestamps — powers the "most active hour" histogram, not a list.
    supabase
      .from("task_activity")
      .select("created_at")
      .eq("actor_id", id)
      .gte("created_at", sinceTs)
      .limit(500),
    // Current open work (any age) — the pending list + overdue signal.
    supabase
      .from("tasks")
      .select(TASK_STAT_COLUMNS)
      .eq("assigned_to", id)
      .neq("status", "done")
      .eq("archived", false),
    // Completed within the window — the done list + throughput + deadline outcomes.
    supabase
      .from("tasks")
      .select(TASK_STAT_COLUMNS)
      .eq("assigned_to", id)
      .eq("status", "done")
      .gte("completed_at", sinceTs)
      .order("completed_at", { ascending: false }),
  ]);

  const targetDeptIds = ((membs ?? []) as { department_id: string }[]).map(
    (m) => m.department_id,
  );

  // Team leads may only review employees in their own department(s).
  const access = await getUserAccess();
  if (access && !access.canManageUsers) {
    const mine = new Set(access.departmentIds);
    if (!targetDeptIds.some((d) => mine.has(d))) notFound();
  }

  const deptNameById = new Map(
    ((depts ?? []) as { id: string; name: string }[]).map((d) => [d.id, d.name]),
  );
  const deptNames = targetDeptIds
    .map((d) => deptNameById.get(d))
    .filter((x): x is string => Boolean(x));

  const activityRows = (activity ?? []) as ActivityLog[];
  const eodReports = (reports ?? []) as EodReport[];
  const acts = (taskActs ?? []) as { created_at: string }[];

  // --- Task performance (from the tasks table, not the activity log) -----
  const openTasks = (openRows ?? []) as TaskLite[];
  const doneTasks = (doneRows ?? []) as TaskLite[];
  const taskStats = computeTaskStats(openTasks, doneTasks, TZ);
  // Open tasks, overdue/soonest first (nulls last) for the pending list.
  const openSorted = [...openTasks].sort((a, b) => {
    const da = a.deadline ?? "9999-12-31";
    const db = b.deadline ?? "9999-12-31";
    return da < db ? -1 : da > db ? 1 : 0;
  });

  // --- Attendance stats --------------------------------------------------
  const daysSeen = activityRows.length;
  const submittedDays = activityRows.filter((a) => a.eod_submitted_at).length;
  const eodRate = daysSeen ? Math.round((submittedDays / daysSeen) * 100) : 0;

  const arrivalMinutes = activityRows
    .map((a) => istMinutes(a.first_seen_at))
    .filter((m): m is number => m !== null);
  const avgArrival =
    arrivalMinutes.length > 0
      ? fmtClock12(Math.round(arrivalMinutes.reduce((s, m) => s + m, 0) / arrivalMinutes.length))
      : "—";

  const avgCompleted = daysSeen ? (taskStats.completed / daysSeen).toFixed(1) : "0";

  const hourHistogram = new Map<number, number>();
  for (const a of acts) {
    const h = hourInTZ(a.created_at, TZ);
    if (h !== null) hourHistogram.set(h, (hourHistogram.get(h) ?? 0) + 1);
  }
  const topHour = [...hourHistogram.entries()].sort((a, b) => b[1] - a[1])[0];
  const mostActive = topHour ? fmtHourRange(topHour[0]) : "—";

  // --- Attendance this month (Mon–Sat; Sundays excluded) -----------------
  const monthNow = localDateISO(TZ);
  const [ayr, amo] = monthNow.split("-").map(Number);
  const { start: monthStart } = monthBounds(ayr, amo - 1);
  const monthAttendance = buildAttendance(
    dateRange(monthStart, monthNow),
    monthNow,
    activityRows.map((a) => ({
      date: a.date,
      first_seen_at: a.first_seen_at,
      last_seen_at: a.last_seen_at,
      eod_submitted_at: a.eod_submitted_at,
    })),
  );
  const att = summarize(monthAttendance);

  return (
    <>
      <div className="mb-2">
        <Link
          href="/reporting/employees"
          className="text-xs font-medium text-muted-foreground transition hover:text-foreground"
        >
          ← All employees
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <PageHeader title={name} description={p.post ? `${p.post} · ${p.email}` : p.email} />
        <Link
          href={`/reporting/eod?employee=${id}`}
          className="rounded-xl border px-3 py-2 text-sm font-medium transition hover:bg-accent"
        >
          All EOD reports →
        </Link>
      </div>

      {deptNames.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-1.5">
          {deptNames.map((d) => (
            <span key={d} className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-primary">
              {d}
            </span>
          ))}
        </div>
      )}

      {/* Stats */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Avg arrival" value={avgArrival} hint={`over ${daysSeen} active days`} />
        <Stat label="Avg completed / day" value={avgCompleted} hint={`${taskStats.completed} in ${WINDOW_DAYS} days`} />
        <Stat label="EOD submission" value={`${eodRate}%`} hint={`${submittedDays}/${daysSeen} days`} />
        <Stat label="Most active" value={mostActive} hint="by task activity" />
      </div>

      {/* Attendance this month */}
      <section className="mb-8">
        <h2 className="mb-3 text-base font-semibold tracking-tight">Attendance this month</h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat
            label="On-time %"
            value={att.onTimePct === null ? "—" : `${att.onTimePct}%`}
            hint={`${att.onTime} of ${att.evaluated} days`}
          />
          <Stat
            label="Late %"
            value={att.latePct === null ? "—" : `${att.latePct}%`}
            hint={`${att.late} late arrival${att.late === 1 ? "" : "s"}`}
          />
          <Stat label="Absent" value={String(att.absent)} hint="working days missed" />
          <Stat label="Incomplete EOD" value={String(att.incomplete)} hint="active, no EOD" />
        </div>
      </section>

      {/* Task performance — completed, open, and deadline reliability */}
      <EmployeeTaskReport
        stats={taskStats}
        open={openSorted}
        completed={doneTasks}
        windowDays={WINDOW_DAYS}
        tz={TZ}
      />

      {/* Activity log */}
      <section className="mb-8">
        <h2 className="mb-3 text-base font-semibold tracking-tight">Activity log</h2>
        <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Day</th>
                  <th className="px-3 py-2.5 font-medium">Arrived</th>
                  <th className="px-3 py-2.5 font-medium">Left</th>
                  <th className="px-3 py-2.5 font-medium">Active for</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {activityRows.map((a) => {
                  const left = a.eod_submitted_at ?? a.last_seen_at;
                  const noEod = !a.eod_submitted_at;
                  return (
                    <tr key={a.id}>
                      <td className="px-4 py-2.5 font-medium">{fmtDay(a.date)}</td>
                      <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                        {formatClockTZ(a.first_seen_at)}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                        {formatClockTZ(left)}
                        {a.incomplete ? (
                          <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-950/50 dark:text-red-300">
                            Incomplete
                          </span>
                        ) : (
                          noEod && (
                            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                              No EOD
                            </span>
                          )
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {formatDuration(a.first_seen_at, left) ?? "—"}
                      </td>
                    </tr>
                  );
                })}
                {activityRows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                      No recorded activity in the last {WINDOW_DAYS} days.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* EOD history */}
      <section>
        <h2 className="mb-3 text-base font-semibold tracking-tight">EOD reports</h2>
        <div className="space-y-2">
          {eodReports.map((r) => (
            <EodReportCard key={r.id} report={r} />
          ))}
          {eodReports.length === 0 && (
            <p className="rounded-xl border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
              No EOD reports submitted yet.
            </p>
          )}
        </div>
      </section>
    </>
  );
}
