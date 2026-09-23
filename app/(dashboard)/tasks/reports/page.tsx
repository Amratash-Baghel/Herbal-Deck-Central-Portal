import { Fragment } from "react";
import { redirect } from "next/navigation";
import { getUserAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { EodNoteForm } from "@/components/tasks/eod-note-form";
import { EodReportCard } from "@/components/reporting/eod-report-card";
import { AttendanceView } from "@/components/reporting/attendance-view";
import { deptNoteColor, noteSwatch } from "@/lib/tasks";
import { localDateISO } from "@/lib/time";
import { time } from "@/lib/perf";
import type { EodReport, EodSummary } from "@/lib/types";

type ProfileRow = { id: string; full_name: string | null; email: string };
type DeptRow = { id: string; name: string; slug: string };
type OverviewRow = {
  employee_id: string;
  created: number;
  in_progress: number;
  completed: number;
  pending: number;
};
/** One department's people, as the table renders them — a block at a time. */
type Group = { name: string; slug: string | null; rows: OverviewRow[] };

const ZERO: EodSummary = { created: 0, in_progress: 0, completed: 0, pending: 0 };

/** Nobody touched a task today — the one number a manager scans this page for. */
function isIdle(r: OverviewRow): boolean {
  return Number(r.created) + Number(r.in_progress) + Number(r.completed) === 0;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-lg font-semibold tracking-tight tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </span>
  );
}

/**
 * EOD Reporting — auto-generated from each person's task activity. Managers and
 * team leads land on the team first (who moved, who didn't), then the submitted
 * reports; their own day sits below. Employees see only their own. Owner-level
 * accounts neither file an EOD nor clock in, so both personal sections are gone
 * for them — this page is purely the team's, read top to bottom.
 */
export default async function ReportsPage() {
  const access = await getUserAccess();
  if (!access) redirect("/login");
  const me = access.profile.id;
  // Only team leads + managers see the team-wide sections; employees see just
  // their own report and history.
  const canViewTeam = access.canViewReports;
  // Founder / CTO level: they read the team's reports, they don't file one.
  const isOwner = access.isAdmin;
  const supabase = await createClient();
  const today = localDateISO();

  const [
    { data: summaryData },
    { data: pendingData },
    { data: todayReport },
    { data: overview },
    { data: recent },
    { data: profs },
    { data: pdRows },
    { data: deptRows },
  ] = await time("tasks/reports:all-queries", () =>
    Promise.all([
      supabase.rpc("eod_summary", { emp: me, d: today }),
      supabase
        .from("tasks")
        .select("id, title")
        .eq("assigned_to", me)
        .neq("status", "done")
        .eq("archived", false)
        .order("created_at", { ascending: false }),
      supabase
        .from("eod_reports")
        .select("*")
        .eq("employee_id", me)
        .eq("report_date", today)
        .maybeSingle(),
      supabase.rpc("eod_overview", { d: today }),
      supabase
        .from("eod_reports")
        .select("*")
        .order("report_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("profiles")
        .select("id, full_name, email")
        .is("deactivated_at", null),
      supabase.from("profile_departments").select("profile_id, department_id"),
      supabase.from("departments").select("id, name, slug").order("name"),
    ]),
  );

  const mine: EodSummary = (summaryData as EodSummary | null) ?? ZERO;
  const myPending = (pendingData ?? []) as { id: string; title: string }[];
  const existingNote = (todayReport as EodReport | null)?.manual_note ?? "";
  const submittedToday = Boolean(todayReport);
  const overviewRows = (overview ?? []) as OverviewRow[];
  const reports = (recent ?? []) as EodReport[];
  const people = (profs ?? []) as ProfileRow[];
  const nameOf = new Map(people.map((p) => [p.id, p.full_name || p.email]));

  const idleCount = overviewRows.filter(isIdle).length;
  const activeCount = overviewRows.length - idleCount;

  // One person sits in one department, so last-wins is the only outcome here.
  const deptById = new Map(((deptRows ?? []) as DeptRow[]).map((d) => [d.id, d]));
  const deptOf = new Map<string, DeptRow>();
  for (const m of ((pdRows ?? []) as { profile_id: string; department_id: string }[])) {
    const d = deptById.get(m.department_id);
    if (d) deptOf.set(m.profile_id, d);
  }

  // Group the day into department blocks — a lead scans their own block, an
  // owner scans which block went quiet. Idle people float to the top of each.
  const grouped = new Map<string, Group>();
  for (const r of overviewRows) {
    const d = deptOf.get(r.employee_id);
    const key = d?.slug ?? "";
    let g = grouped.get(key);
    if (!g) {
      g = { name: d?.name ?? "No department", slug: d?.slug ?? null, rows: [] };
      grouped.set(key, g);
    }
    g.rows.push(r);
  }
  const groups = [...grouped.values()].sort((a, b) =>
    a.slug && b.slug ? a.name.localeCompare(b.name) : a.slug ? -1 : 1,
  );
  for (const g of groups) {
    g.rows.sort(
      (a, b) =>
        Number(isIdle(b)) - Number(isIdle(a)) ||
        (nameOf.get(a.employee_id) ?? "").localeCompare(nameOf.get(b.employee_id) ?? ""),
    );
  }

  // Fifty cards is a wall. Show the latest handful, fold the rest away.
  const shown = reports.slice(0, 10);
  const older = reports.slice(10);

  const yourDay = !isOwner && (
    <section className="mb-8 rounded-2xl border bg-card p-5 shadow-sm">
      <h2 className="text-base font-semibold tracking-tight">Your day, so far</h2>
      {/* One line, not four boxes — these are your own numbers, not the headline. */}
      <div className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <Stat label="created" value={mine.created} />
        <Stat label="started" value={mine.in_progress} />
        <Stat label="completed" value={mine.completed} />
        <Stat label="pending" value={mine.pending} />
      </div>

      {myPending.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium text-muted-foreground">Still pending</p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {myPending.slice(0, 12).map((t) => (
              <li key={t.id} className="rounded-full bg-muted px-2.5 py-1 text-xs">
                {t.title}
              </li>
            ))}
          </ul>
        </div>
      )}

      <EodNoteForm initialNote={existingNote} alreadySubmitted={submittedToday} />
    </section>
  );

  const yourAttendance = !isOwner && (
    <section className="mb-8">
      <h2 className="mb-3 text-base font-semibold tracking-tight">Your attendance</h2>
      <AttendanceView
        people={[{ id: me, name: "You" }]}
        selfId={me}
        canPickOthers={false}
        todayISO={today}
      />
    </section>
  );

  const teamToday = canViewTeam && (
    <section className="mb-8">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold tracking-tight">Today across the team</h2>
        {overviewRows.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {activeCount} active
            {idleCount > 0 && (
              <>
                {" · "}
                <span className="font-medium text-red-600 dark:text-red-400">
                  {idleCount} idle
                </span>
              </>
            )}
          </p>
        )}
      </div>
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        {/* Five columns don't fit a phone; scroll the table, not the page. */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Person</th>
                <th className="px-3 py-2.5 text-center font-medium">Created</th>
                <th className="px-3 py-2.5 text-center font-medium">Started</th>
                <th className="px-3 py-2.5 text-center font-medium">Completed</th>
                <th className="px-3 py-2.5 text-center font-medium">Pending</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {groups.map((g) => {
                const gIdle = g.rows.filter(isIdle).length;
                // The department's own colour — the same map the board and
                // scheduler colour their notes by, so a hue means one thing.
                const stripe = noteSwatch(deptNoteColor(g.slug));
                return (
                  <Fragment key={g.slug ?? "none"}>
                    <tr className="bg-muted/30">
                      <td
                        colSpan={5}
                        style={{ borderLeftColor: stripe }}
                        className="border-l-4 px-4 py-2"
                      >
                        <span className="flex flex-wrap items-baseline gap-x-2.5">
                          <span className="text-xs font-semibold uppercase tracking-wide">
                            {g.name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {g.rows.length - gIdle} active
                            {gIdle > 0 && (
                              <>
                                {" · "}
                                <span className="font-medium text-red-600 dark:text-red-400">
                                  {gIdle} idle
                                </span>
                              </>
                            )}
                          </span>
                        </span>
                      </td>
                    </tr>
                    {g.rows.map((r) => {
                      const idle = isIdle(r);
                      return (
                        <tr
                          key={r.employee_id}
                          className={idle ? "bg-red-50/60 dark:bg-red-950/20" : ""}
                        >
                          <td
                            style={{ borderLeftColor: stripe }}
                            className="border-l-4 py-2 pl-7 pr-4 font-medium"
                          >
                            {nameOf.get(r.employee_id) ?? "Someone"}
                            {idle && (
                              <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-950/50 dark:text-red-300">
                                no activity
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center tabular-nums">
                            {Number(r.created)}
                          </td>
                          <td className="px-3 py-2 text-center tabular-nums">
                            {Number(r.in_progress)}
                          </td>
                          <td className="px-3 py-2 text-center tabular-nums">
                            {Number(r.completed)}
                          </td>
                          <td className="px-3 py-2 text-center tabular-nums text-muted-foreground">
                            {Number(r.pending)}
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                );
              })}
              {overviewRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                    No people to show.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );

  const recentReports = (
    <section className="mb-8">
      <h2 className="mb-3 text-base font-semibold tracking-tight">
        {canViewTeam ? "Recent reports" : "Your recent reports"}
      </h2>
      <ul className="space-y-2">
        {reports.length === 0 && (
          <li className="flex flex-col items-center gap-3 rounded-xl border bg-card px-4 py-8 text-center">
            <p className="text-sm text-muted-foreground">No reports submitted yet.</p>
            {!isOwner && (
              // The textarea's own id — a plain anchor, no client JS.
              <a
                href="#eod-note"
                className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-90"
              >
                Write today&rsquo;s report
              </a>
            )}
          </li>
        )}
        {shown.map((r) => (
          <li key={r.id}>
            <EodReportCard
              report={r}
              employeeName={canViewTeam ? nameOf.get(r.employee_id) : undefined}
            />
          </li>
        ))}
      </ul>

      {older.length > 0 && (
        <details className="mt-3">
          <summary className="list-none rounded-lg px-1 py-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground">
            {older.length} older
          </summary>
          <ul className="mt-2 space-y-2">
            {older.map((r) => (
              <li key={r.id}>
                <EodReportCard
                  report={r}
                  employeeName={canViewTeam ? nameOf.get(r.employee_id) : undefined}
                />
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );

  return (
    <>
      <PageHeader
        title="End-of-day Reports"
        description={
          isOwner
            ? "Who moved today, who didn't, and every report as it comes in."
            : "Auto-built from your task activity. Add a note to wrap up your day."
        }
      />
      {/* A manager opens this for the team; an employee opens it for themselves. */}
      {canViewTeam ? (
        <>
          {teamToday}
          {recentReports}
          {yourDay}
          {yourAttendance}
        </>
      ) : (
        <>
          {yourDay}
          {yourAttendance}
          {recentReports}
        </>
      )}
    </>
  );
}
