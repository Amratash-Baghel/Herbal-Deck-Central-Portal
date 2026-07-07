import { redirect } from "next/navigation";
import { getUserAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { CalendarView, type EventLite } from "@/components/calendar/calendar-view";
import { localDateISO } from "@/lib/time";
import { time } from "@/lib/perf";
import { monthGrid, parseMonthKey, creatableEventTypes } from "@/lib/calendar";
import { computeDay, type ActivityLite } from "@/lib/attendance";
import type { CalendarEvent } from "@/lib/types";

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string;
  date_of_birth: string | null;
};

/**
 * Calendar — a month view of the events the signed-in user may see (RLS-scoped),
 * plus year-recurring birthdays (from profiles) and their own attendance flags.
 * Month navigation is a server round-trip via `?m=YYYY-MM`.
 */
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const access = await getUserAccess();
  if (!access) redirect("/login");
  const me = access.profile.id;
  const today = localDateISO();

  const { m } = await searchParams;
  const { year, month } = parseMonthKey(m, today);
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  const grid = monthGrid(year, month);
  const gridStart = grid[0].date;
  const gridEnd = grid[grid.length - 1].date;

  const supabase = await createClient();

  const [{ data: events }, { data: profs }, { data: depts }, { data: myLogs }] =
    await time("calendar:queries", () =>
      Promise.all([
        supabase
          .from("calendar_events")
          .select("*")
          .gte("event_date", gridStart)
          .lte("event_date", gridEnd)
          .order("event_time", { ascending: true, nullsFirst: true }),
        supabase
          .from("profiles")
          .select("id, full_name, email, date_of_birth")
          .is("deactivated_at", null),
        supabase.from("departments").select("id, name").order("name"),
        supabase
          .from("activity_logs")
          .select("date, first_seen_at, last_seen_at, eod_submitted_at")
          .eq("employee_id", me)
          .gte("date", gridStart)
          .lte("date", gridEnd),
      ]),
    );

  const profileList = (profs ?? []) as ProfileRow[];
  const nameOf = new Map(profileList.map((p) => [p.id, p.full_name || p.email]));

  const eventsByDate: Record<string, EventLite[]> = {};
  for (const e of (events ?? []) as CalendarEvent[]) {
    (eventsByDate[e.event_date] ??= []).push({
      id: e.id,
      title: e.title,
      description: e.description,
      event_type: e.event_type,
      event_time: e.event_time,
      creatorName: nameOf.get(e.created_by) ?? "Someone",
      mine: e.created_by === me,
    });
  }

  // Year-recurring birthdays, keyed by MM-DD.
  const birthdaysByKey: Record<string, string[]> = {};
  for (const p of profileList) {
    if (!p.date_of_birth) continue;
    const key = p.date_of_birth.slice(5);
    (birthdaysByKey[key] ??= []).push(p.full_name || p.email);
  }

  // The signed-in user's own attendance status per day (for the flag dots).
  const logByDate = new Map(
    ((myLogs ?? []) as ActivityLite[]).map((l) => [l.date, l]),
  );
  const attendanceByDate: Record<string, string> = {};
  for (const g of grid) {
    attendanceByDate[g.date] = computeDay(g.date, today, logByDate.get(g.date)).status;
  }

  return (
    <>
      <PageHeader
        title="Calendar"
        description="Events, holidays, and birthdays — with your attendance at a glance."
      />
      <CalendarView
        monthKey={monthKey}
        todayISO={today}
        eventsByDate={eventsByDate}
        birthdaysByKey={birthdaysByKey}
        attendanceByDate={attendanceByDate}
        departments={(depts ?? []) as { id: string; name: string }[]}
        allowedTypes={creatableEventTypes(access)}
      />
    </>
  );
}
