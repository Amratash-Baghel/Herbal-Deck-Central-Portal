import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { TaskBoard } from "@/components/tasks/task-board";
import type { Person, DeptRef } from "@/components/tasks/types";
import type { Task } from "@/lib/types";

type ProfileRow = { id: string; full_name: string | null; email: string };
const toPerson = (p: ProfileRow): Person => ({
  id: p.id,
  name: p.full_name || p.email,
});

/**
 * My Board — the signed-in user's personal kanban of tasks they created or were
 * assigned. Loads the board data (tasks, the team directory for names, the
 * people they can assign, and their departments) and hands off to the client.
 */
export default async function TasksPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const me = profile.id;

  const [{ data: pdRows }, { data: allDepts }, { data: profs }, { data: taskRows }] =
    await Promise.all([
      supabase.from("profile_departments").select("department_id").eq("profile_id", me),
      supabase.from("departments").select("id, name, slug").order("name"),
      supabase
        .from("profiles")
        .select("id, full_name, email")
        .is("deactivated_at", null)
        .order("full_name", { nullsFirst: false }),
      supabase
        .from("tasks")
        .select("*")
        .or(`created_by.eq.${me},assigned_to.eq.${me}`)
        .eq("archived", false)
        .order("created_at", { ascending: false }),
    ]);

  const myDeptIds = (pdRows ?? []).map((r) => r.department_id as string);
  const allDepartments: DeptRef[] = (allDepts ?? []) as DeptRef[];
  const myDepartments = allDepartments.filter((d) => myDeptIds.includes(d.id));

  // People in the user's department(s) they may assign to (plus themselves).
  const assignableIds = new Set<string>([me]);
  if (myDeptIds.length > 0) {
    const { data: memberRows } = await supabase
      .from("profile_departments")
      .select("profile_id")
      .in("department_id", myDeptIds);
    for (const r of memberRows ?? []) assignableIds.add(r.profile_id as string);
  }

  const people = ((profs ?? []) as ProfileRow[]).map(toPerson);
  // Admins + HR & Management can assign to anyone; everyone else to people in
  // their department(s).
  const canManage =
    profile.role === "admin" ||
    myDepartments.some((d) => d.slug === "hr-management");
  const assignable = canManage
    ? people
    : people.filter((p) => assignableIds.has(p.id));

  return (
    <>
      <PageHeader
        title="My Board"
        description="Your tasks as sticky notes — add one, drag it across, get it done."
      />
      <TaskBoard
        me={toPerson(profile)}
        initialTasks={(taskRows ?? []) as Task[]}
        people={people}
        assignable={assignable}
        departments={myDepartments}
        allDepartments={allDepartments}
      />
    </>
  );
}
