import { getUserAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import {
  AttendanceView,
  type AttendancePerson,
} from "@/components/reporting/attendance-view";
import { localDateISO } from "@/lib/time";

type ProfileRow = { id: string; full_name: string | null; email: string };

/**
 * Attendance — a daywise attendance calendar per employee (Mon–Sat working days,
 * 10 AM on-time cutoff, Sundays off). Admins + HR see everyone; team leads see
 * their own department(s). Employees see their own attendance on the EOD Reports
 * page instead (this tab lives under Reporting, which they don't access).
 */
export default async function AttendancePage() {
  const access = await getUserAccess();
  const scopeDeptIds =
    access && !access.canManageUsers ? new Set(access.departmentIds) : null;
  const supabase = await createClient();

  const [{ data: profs }, { data: depts }, { data: membs }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email")
      .is("deactivated_at", null)
      .order("full_name", { nullsFirst: false }),
    supabase.from("departments").select("id, name").order("name"),
    supabase.from("profile_departments").select("profile_id, department_id"),
  ]);

  const deptIdsByPerson = new Map<string, string[]>();
  for (const m of (membs ?? []) as { profile_id: string; department_id: string }[]) {
    const list = deptIdsByPerson.get(m.profile_id) ?? [];
    list.push(m.department_id);
    deptIdsByPerson.set(m.profile_id, list);
  }

  let people: AttendancePerson[] = ((profs ?? []) as ProfileRow[]).map((p) => ({
    id: p.id,
    name: p.full_name || p.email,
    departmentIds: deptIdsByPerson.get(p.id) ?? [],
  }));
  let departments = (depts ?? []) as { id: string; name: string }[];

  // Team leads: only their own department(s) and the people in them.
  if (scopeDeptIds) {
    people = people.filter((p) =>
      (p.departmentIds ?? []).some((id) => scopeDeptIds.has(id)),
    );
    departments = departments.filter((d) => scopeDeptIds.has(d.id));
  }

  return (
    <>
      <PageHeader
        title="Attendance"
        description="Daywise attendance per employee — arrival, EOD, active time, and status."
      />
      <AttendanceView
        people={people}
        departments={departments}
        selfId={access?.profile.id ?? ""}
        canPickOthers
        todayISO={localDateISO()}
      />
    </>
  );
}
