import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { EodNoteForm } from "@/components/tasks/eod-note-form";
import { localDateISO } from "@/lib/time";
import { time } from "@/lib/perf";
import type { EodReport, EodSummary } from "@/lib/types";

type ProfileRow = { id: string; full_name: string | null; email: string };
type OverviewRow = {
  employee_id: string;
  created: number;
  in_progress: number;
  completed: number;
  pending: number;
};

const ZERO: EodSummary = { created: 0, in_progress: 0, completed: 0, pending: 0 };

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-background p-3 text-center">
      <p className="text-xl font-semibold tracking-tight">{value}</p>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}

function fmtDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/**
 * EOD Reporting — auto-generated from each person's task activity. Shows your
 * own report for today (with an optional note to finalise), today's activity
 * across everyone you can see (idle people flagged), and recent submitted
 * reports. Visibility follows the same rules as the rest of the module: your
 * own, your department's, and — for managers — everyone's.
 */
export default async function ReportsPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const me = profile.id;
  const today = localDateISO();

  const [
    { data: summaryData },
    { data: pendingData },
    { data: todayReport },
    { data: overview },
    { data: recent },
    { data: profs },
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
    ]),
  );

  const mine: EodSummary = (summaryData as EodSummary | null) ?? ZERO;
  const myPending = (pendingData ?? []) as { id: string; title: string }[];
  const existingNote = (todayReport as EodReport | null)?.manual_note ?? "";
  const submittedToday = Boolean(todayReport);
  const overviewRows = (overview ?? []) as OverviewRow[];
  const reports = (recent ?? []) as EodReport[];
  const nameOf = new Map(
    ((profs ?? []) as ProfileRow[]).map((p) => [p.id, p.full_name || p.email]),
  );

  return (
    <>
      <PageHeader
        title="End-of-day Reports"
        description="Auto-built from your task activity. Add a note to wrap up your day."
      />

      {/* Your report */}
      <section className="mb-8 rounded-2xl border bg-card p-5 shadow-sm">
        <h2 className="text-base font-semibold tracking-tight">Your day, so far</h2>
        <div className="mt-3 grid grid-cols-4 gap-3">
          <Tile label="Created" value={mine.created} />
          <Tile label="Started" value={mine.in_progress} />
          <Tile label="Completed" value={mine.completed} />
          <Tile label="Pending" value={mine.pending} />
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

      {/* Team today */}
      <section className="mb-8">
        <h2 className="mb-3 text-base font-semibold tracking-tight">Today across the team</h2>
        <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Person</th>
                <th className="px-3 py-2 text-center font-medium">Created</th>
                <th className="px-3 py-2 text-center font-medium">Started</th>
                <th className="px-3 py-2 text-center font-medium">Completed</th>
                <th className="px-3 py-2 text-center font-medium">Pending</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {overviewRows.map((r) => {
                const idle =
                  Number(r.created) + Number(r.in_progress) + Number(r.completed) === 0;
                return (
                  <tr key={r.employee_id} className={idle ? "bg-red-50/60 dark:bg-red-950/20" : ""}>
                    <td className="px-4 py-2 font-medium">
                      {nameOf.get(r.employee_id) ?? "Someone"}
                      {idle && (
                        <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-950/50 dark:text-red-300">
                          no activity
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">{Number(r.created)}</td>
                    <td className="px-3 py-2 text-center">{Number(r.in_progress)}</td>
                    <td className="px-3 py-2 text-center">{Number(r.completed)}</td>
                    <td className="px-3 py-2 text-center text-muted-foreground">{Number(r.pending)}</td>
                  </tr>
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
      </section>

      {/* Recent submitted reports */}
      <section>
        <h2 className="mb-3 text-base font-semibold tracking-tight">Recent reports</h2>
        <ul className="space-y-2">
          {reports.length === 0 && (
            <li className="rounded-xl border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
              No reports submitted yet.
            </li>
          )}
          {reports.map((r) => {
            const s = r.auto_summary ?? ZERO;
            return (
              <li key={r.id} className="rounded-xl border bg-card px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium">
                    {nameOf.get(r.employee_id) ?? "Someone"}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {fmtDate(r.report_date)}
                    </span>
                  </span>
                  <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-primary">
                    Submitted
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {Number(s.created)} created · {Number(s.in_progress)} started ·{" "}
                  {Number(s.completed)} completed · {Number(s.pending)} pending
                </p>
                {r.manual_note && (
                  <p className="mt-1.5 text-sm text-foreground/80">{r.manual_note}</p>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
