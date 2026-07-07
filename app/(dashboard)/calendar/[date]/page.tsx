import Link from "next/link";
import { notFound } from "next/navigation";
import { getUserAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { EodReportCard } from "@/components/reporting/eod-report-card";
import { localDateISO, formatClockTZ, formatMs } from "@/lib/time";
import { computeDay, isSunday, STATUS_META, type ActivityLite } from "@/lib/attendance";
import { EVENT_TYPE_META } from "@/lib/calendar";
import type { CalendarEvent, EodReport } from "@/lib/types";

type ProfileRow = { id: string; full_name: string | null; email: string };

function fmtTime(t: string | null): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const period = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status as keyof typeof STATUS_META] ?? STATUS_META.upcoming;
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.tone}`}>
      {meta.label}
    </span>
  );
}

function Tile({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl border bg-card p-3 text-center shadow-sm">
      <p className={`text-xl font-semibold tracking-tight ${tone ?? ""}`}>{value}</p>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}

/**
 * A single day's report, reached by clicking a date on the calendar. Everyone
 * sees that day's events. Managers / team leads additionally see team attendance
 * (scoped by RLS); a regular employee sees their own attendance + EOD report.
 */
export default async function DayReportPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();

  const access = await getUserAccess();
  if (!access) notFound();
  const me = access.profile.id;
  const today = localDateISO();
  const isFuture = date > today;
  const sunday = isSunday(date);

  const supabase = await createClient();

  // Events on this day, visible to the viewer (RLS).
  const { data: eventRows } = await supabase
    .from("calendar_events")
    .select("*")
    .eq("event_date", date)
    .order("event_time", { ascending: true, nullsFirst: true });
  const events = (eventRows ?? []) as CalendarEvent[];

  const canViewTeam = access.canViewReports;

  const longDate = new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <>
      <div className="mb-2">
        <Link
          href={`/calendar?m=${date.slice(0, 7)}`}
          className="text-xs font-medium text-muted-foreground transition hover:text-foreground"
        >
          ← Back to calendar
        </Link>
      </div>
      <PageHeader
        title={longDate}
        description={
          sunday
            ? "Sunday — a non-working day."
            : isFuture
              ? "This day hasn't happened yet."
              : canViewTeam
                ? "Team attendance and events for the day."
                : "Your attendance and report for the day."
        }
      />

      {/* Events */}
      <section className="mb-8">
        <h2 className="mb-3 text-base font-semibold tracking-tight">Events</h2>
        {events.length === 0 ? (
          <p className="rounded-xl border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
            No events on this day.
          </p>
        ) : (
          <ul className="space-y-2">
            {events.map((e) => (
              <li key={e.id} className="rounded-xl border bg-card px-4 py-3">
                <p className="text-sm font-medium">{e.title}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                  <span className={`rounded-full px-2 py-0.5 font-medium ${EVENT_TYPE_META[e.event_type].badge}`}>
                    {EVENT_TYPE_META[e.event_type].label}
                  </span>
                  {e.event_time && <span>{fmtTime(e.event_time)}</span>}
                </p>
                {e.description && (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-foreground/80">{e.description}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {!isFuture && !sunday && (
        canViewTeam ? (
          <TeamDay date={date} today={today} scopeDeptIds={access.canManageUsers ? null : access.departmentIds} />
        ) : (
          <OwnDay date={date} today={today} me={me} />
        )
      )}
    </>
  );
}

/** Team attendance for the day — every visible employee's status (RLS-scoped). */
async function TeamDay({
  date,
  today,
  scopeDeptIds,
}: {
  date: string;
  today: string;
  scopeDeptIds: string[] | null;
}) {
  const supabase = await createClient();
  const [{ data: profs }, { data: membs }, { data: logs }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email")
      .is("deactivated_at", null)
      .order("full_name", { nullsFirst: false }),
    supabase.from("profile_departments").select("profile_id, department_id"),
    supabase
      .from("activity_logs")
      .select("employee_id, date, first_seen_at, last_seen_at, eod_submitted_at")
      .eq("date", date),
  ]);

  const deptIdsByPerson = new Map<string, string[]>();
  for (const m of (membs ?? []) as { profile_id: string; department_id: string }[]) {
    const list = deptIdsByPerson.get(m.profile_id) ?? [];
    list.push(m.department_id);
    deptIdsByPerson.set(m.profile_id, list);
  }

  let people = (profs ?? []) as ProfileRow[];
  if (scopeDeptIds) {
    const scope = new Set(scopeDeptIds);
    people = people.filter((p) =>
      (deptIdsByPerson.get(p.id) ?? []).some((id) => scope.has(id)),
    );
  }

  const logByEmp = new Map(
    ((logs ?? []) as (ActivityLite & { employee_id: string })[]).map((l) => [l.employee_id, l]),
  );

  const rows = people.map((p) => ({
    id: p.id,
    name: p.full_name || p.email,
    ...computeDay(date, today, logByEmp.get(p.id)),
  }));

  const counts = { on_time: 0, late: 0, incomplete: 0, absent: 0 };
  for (const r of rows) {
    if (r.status in counts) counts[r.status as keyof typeof counts]++;
  }

  return (
    <section className="mb-8">
      <h2 className="mb-3 text-base font-semibold tracking-tight">Team attendance</h2>
      <div className="mb-4 grid grid-cols-4 gap-3">
        <Tile label="On time" value={counts.on_time} tone="text-emerald-600 dark:text-emerald-400" />
        <Tile label="Late" value={counts.late} tone="text-amber-600 dark:text-amber-400" />
        <Tile label="Incomplete" value={counts.incomplete} tone={counts.incomplete ? "text-orange-600 dark:text-orange-400" : undefined} />
        <Tile label="Absent" value={counts.absent} tone={counts.absent ? "text-red-600 dark:text-red-400" : undefined} />
      </div>
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Person</th>
                <th className="px-3 py-2.5 font-medium">Arrived</th>
                <th className="px-3 py-2.5 font-medium">EOD</th>
                <th className="px-3 py-2.5 font-medium">Active</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2 font-medium">
                    <Link href={`/reporting/employees/${r.id}`} className="transition hover:text-primary">
                      {r.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">
                    {r.arrival ? formatClockTZ(r.arrival) : "—"}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">
                    {r.eodSubmitted && r.departure ? formatClockTZ(r.departure) : "—"}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{formatMs(r.activeMs) ?? "—"}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={r.status} />
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
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
}

/** A regular employee's own day — their attendance status + EOD report. */
async function OwnDay({ date, today, me }: { date: string; today: string; me: string }) {
  const supabase = await createClient();
  const [{ data: logRows }, { data: report }] = await Promise.all([
    supabase
      .from("activity_logs")
      .select("date, first_seen_at, last_seen_at, eod_submitted_at")
      .eq("employee_id", me)
      .eq("date", date)
      .maybeSingle(),
    supabase
      .from("eod_reports")
      .select("*")
      .eq("employee_id", me)
      .eq("report_date", date)
      .maybeSingle(),
  ]);

  const day = computeDay(date, today, (logRows as ActivityLite | null) ?? undefined);

  return (
    <section className="mb-8">
      <h2 className="mb-3 text-base font-semibold tracking-tight">Your day</h2>
      <div className="mb-4 flex flex-wrap items-center gap-4 rounded-2xl border bg-card px-4 py-3 text-sm shadow-sm">
        <span className="flex items-center gap-2">
          <span className="text-muted-foreground">Status</span>
          <StatusBadge status={day.status} />
        </span>
        <span>
          <span className="text-muted-foreground">Arrived </span>
          {day.arrival ? formatClockTZ(day.arrival) : "—"}
        </span>
        <span>
          <span className="text-muted-foreground">EOD </span>
          {day.eodSubmitted && day.departure ? formatClockTZ(day.departure) : "—"}
        </span>
        <span>
          <span className="text-muted-foreground">Active </span>
          {formatMs(day.activeMs) ?? "—"}
        </span>
      </div>

      <h3 className="mb-2 text-sm font-semibold tracking-tight">EOD report</h3>
      {report ? (
        <EodReportCard report={report as EodReport} defaultOpen />
      ) : (
        <p className="rounded-xl border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
          No EOD report submitted for this day.
        </p>
      )}
    </section>
  );
}
