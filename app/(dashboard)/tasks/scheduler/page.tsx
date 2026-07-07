import { redirect } from "next/navigation";
import { getUserAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { localDateISO } from "@/lib/time";
import { PageHeader } from "@/components/page-header";
import { SchedulerClient } from "@/components/tasks/scheduler-client";
import type { DeptRef, Person } from "@/components/tasks/types";
import type { ScheduleTarget, TaskSchedule } from "@/lib/types";

type ProfileRow = { id: string; full_name: string | null; email: string };

/**
 * Task Scheduler — create recurring/scheduled tasks that materialise onto the
 * assignee's board. Employees schedule for themselves; team leads for people in
 * their department(s); admins + HR for anyone, a department, or everyone. Who
 * you may target is enforced by RLS; this page just offers the right controls.
 */
export default async function SchedulerPage() {
  const access = await getUserAccess();
  if (!access) redirect("/login");
  const me = access.profile.id;
  const supabase = await createClient();

  const [{ data: pdRows }, { data: allDepts }, { data: profs }, { data: schedRows }] =
    await Promise.all([
      supabase.from("profile_departments").select("profile_id, department_id"),
      supabase.from("departments").select("id, name, slug").order("name"),
      supabase
        .from("profiles")
        .select("id, full_name, email")
        .is("deactivated_at", null)
        .order("full_name", { nullsFirst: false }),
      supabase
        .from("task_schedules")
        .select("*")
        .order("created_at", { ascending: false }),
    ]);

  const memberships = (pdRows ?? []) as { profile_id: string; department_id: string }[];
  const myDeptIds = memberships
    .filter((m) => m.profile_id === me)
    .map((m) => m.department_id);
  const allDepartments = (allDepts ?? []) as DeptRef[];
  const allPeople: Person[] = ((profs ?? []) as ProfileRow[]).map((p) => ({
    id: p.id,
    name: p.full_name || p.email,
  }));
  const nameOf = Object.fromEntries(allPeople.map((p) => [p.id, p.name]));
  const deptNameOf = Object.fromEntries(allDepartments.map((d) => [d.id, d.name]));

  // Whom this user may target with a "person" schedule.
  let people: Person[];
  if (access.canManageUsers) {
    people = allPeople;
  } else if (access.isTeamLead && myDeptIds.length > 0) {
    const ids = new Set<string>([me]);
    for (const m of memberships) {
      if (myDeptIds.includes(m.department_id)) ids.add(m.profile_id);
    }
    people = allPeople.filter((p) => ids.has(p.id));
  } else {
    people = allPeople.filter((p) => p.id === me);
  }

  // Departments they may attach / target.
  const departments = access.canManageUsers
    ? allDepartments
    : allDepartments.filter((d) => myDeptIds.includes(d.id));

  const allowedTargets: ScheduleTarget[] = access.canManageUsers
    ? ["person", "department", "everyone"]
    : access.isTeamLead
      ? ["person", "department"]
      : ["person"];

  return (
    <>
      <PageHeader
        title="Task Scheduler"
        description="Schedule recurring or one-off tasks — they appear on the assignee's board on the day."
      />
      <SchedulerClient
        me={me}
        schedules={(schedRows ?? []) as TaskSchedule[]}
        people={people}
        departments={departments}
        allowedTargets={allowedTargets}
        nameOf={nameOf}
        deptNameOf={deptNameOf}
        todayISO={localDateISO()}
      />
    </>
  );
}
