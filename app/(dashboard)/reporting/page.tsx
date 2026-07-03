import { getUserAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { TeamOverview, type OverviewRow } from "@/components/reporting/team-overview";
import { time } from "@/lib/perf";
import { localDateISO } from "@/lib/time";
import type { DeptRef } from "@/components/tasks/types";

type ProfileRow = { id: string; full_name: string | null; email: string };
type ActivityRow = {
  employee_id: string;
  first_seen_at: string;
  last_seen_at: string;
  eod_submitted_at: string | null;
  incomplete: boolean;
};
type EodOverviewRow = { employee_id: string; completed: number };

/**
 * Team Overview — today's activity at a glance. Who's online now, who has
 * submitted their EOD, who's incomplete, plus tasks completed today. Admins +
 * HR see everyone; team leads see only their own department(s).
 */
export default async function TeamOverviewPage() {
  const access = await getUserAccess();
  const scopeDeptIds =
    access && !access.canManageUsers ? new Set(access.departmentIds) : null;
  const supabase = await createClient();
  const today = localDateISO();

  const [{ data: profs }, { data: depts }, { data: membs }, { data: activity }, { data: overview }] =
    await time("reporting/overview:queries", () =>
      Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, email")
          .is("deactivated_at", null)
          .order("full_name", { nullsFirst: false }),
        supabase.from("departments").select("id, name, slug").order("name"),
        supabase.from("profile_departments").select("profile_id, department_id"),
        supabase
          .from("activity_logs")
          .select("employee_id, first_seen_at, last_seen_at, eod_submitted_at, incomplete")
          .eq("date", today),
        supabase.rpc("eod_overview", { d: today }),
      ]),
    );

  const departments = (depts ?? []) as DeptRef[];
  const deptNameById = new Map(departments.map((d) => [d.id, d.name]));
  const deptIdsByPerson = new Map<string, string[]>();
  for (const m of (membs ?? []) as { profile_id: string; department_id: string }[]) {
    const list = deptIdsByPerson.get(m.profile_id) ?? [];
    list.push(m.department_id);
    deptIdsByPerson.set(m.profile_id, list);
  }
  const activityByPerson = new Map(
    ((activity ?? []) as ActivityRow[]).map((a) => [a.employee_id, a]),
  );
  const completedByPerson = new Map(
    ((overview ?? []) as EodOverviewRow[]).map((o) => [o.employee_id, Number(o.completed)]),
  );

  let rows: OverviewRow[] = ((profs ?? []) as ProfileRow[]).map((p) => {
    const a = activityByPerson.get(p.id);
    const deptIds = deptIdsByPerson.get(p.id) ?? [];
    return {
      id: p.id,
      name: p.full_name || p.email,
      departmentIds: deptIds,
      departmentNames: deptIds.map((id) => deptNameById.get(id) ?? "").filter(Boolean),
      arrivedAt: a?.first_seen_at ?? null,
      lastSeenAt: a?.last_seen_at ?? null,
      eodSubmittedAt: a?.eod_submitted_at ?? null,
      incomplete: a?.incomplete ?? false,
      completedToday: completedByPerson.get(p.id) ?? 0,
    };
  });

  // Team leads only see their own department(s).
  let visibleDepartments = departments;
  if (scopeDeptIds) {
    rows = rows.filter((r) => r.departmentIds.some((id) => scopeDeptIds.has(id)));
    visibleDepartments = departments.filter((d) => scopeDeptIds.has(d.id));
  }

  return (
    <>
      <PageHeader
        title="Team Overview"
        description="Today's activity — who's online, who's wrapped up, and who hasn't shown up."
      />
      <TeamOverview rows={rows} departments={visibleDepartments} today={today} />
    </>
  );
}
