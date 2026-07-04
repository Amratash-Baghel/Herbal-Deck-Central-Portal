import { redirect } from "next/navigation";
import { getUserAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { TaskBoard } from "@/components/tasks/task-board";
import type { Person, DeptRef } from "@/components/tasks/types";
import { time } from "@/lib/perf";
import { TASK_LIST_COLUMNS, type Task } from "@/lib/types";

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string;
  avatar_path: string | null;
};
const toPerson = (p: ProfileRow): Person => ({
  id: p.id,
  name: p.full_name || p.email,
  avatarPath: p.avatar_path,
});

/**
 * My Board — the signed-in user's personal kanban of tasks they created or were
 * assigned. Loads the board data (tasks, the team directory for names, the
 * people they can assign, and their departments) and hands off to the client.
 */
export default async function TasksPage() {
  const access = await getUserAccess();
  if (!access) redirect("/login");
  const profile = access.profile;
  const supabase = await createClient();
  const me = profile.id;

  const [{ data: pdRows }, { data: allDepts }, { data: profs }, { data: taskRows }] =
    await time("tasks:board-queries", () =>
      Promise.all([
        supabase.from("profile_departments").select("department_id").eq("profile_id", me),
        supabase.from("departments").select("id, name, slug").order("name"),
        supabase
          .from("profiles")
          .select("id, full_name, email, avatar_path")
          .is("deactivated_at", null)
          .order("full_name", { nullsFirst: false }),
        supabase
          .from("tasks")
          .select(TASK_LIST_COLUMNS)
          .or(`created_by.eq.${me},assigned_to.eq.${me}`)
          .eq("archived", false)
          .order("created_at", { ascending: false }),
      ]),
    );

  const myDeptIds = (pdRows ?? []).map((r) => r.department_id as string);
  const allDepartments: DeptRef[] = (allDepts ?? []) as DeptRef[];
  const myDepartments = allDepartments.filter((d) => myDeptIds.includes(d.id));

  const people = ((profs ?? []) as ProfileRow[]).map(toPerson);

  // Who can this person assign tasks to?
  //   admin / HR → anyone;  team lead → their department(s);  employee → self.
  const canManage = access.canManageUsers;
  let assignable: Person[];
  if (canManage) {
    assignable = people;
  } else if (access.isTeamLead && myDeptIds.length > 0) {
    const ids = new Set<string>([me]);
    const { data: memberRows } = await supabase
      .from("profile_departments")
      .select("profile_id")
      .in("department_id", myDeptIds);
    for (const r of memberRows ?? []) ids.add(r.profile_id as string);
    assignable = people.filter((p) => ids.has(p.id));
  } else {
    // Regular employees can only create tasks for themselves.
    assignable = people.filter((p) => p.id === me);
  }

  return (
    <>
      <PageHeader
        title="My Board"
        description="Your tasks as sticky notes — add one, drag it across, get it done."
      />
      <TaskBoard
        me={toPerson(profile)}
        canManage={canManage}
        canAssignOthers={access.canManageUsers || access.isTeamLead}
        initialTasks={(taskRows ?? []) as Task[]}
        people={people}
        assignable={assignable}
        departments={myDepartments}
        allDepartments={allDepartments}
      />
    </>
  );
}
