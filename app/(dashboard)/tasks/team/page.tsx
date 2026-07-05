import { redirect } from "next/navigation";
import { getUserAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { TaskList } from "@/components/tasks/task-list";
import { localDateISO } from "@/lib/time";
import { TASK_LIST_COLUMNS, type Task } from "@/lib/types";
import type { Person, DeptRef } from "@/components/tasks/types";

type ProfileRow = { id: string; full_name: string | null; email: string; color: string | null };
const toPerson = (p: ProfileRow): Person => ({
  id: p.id,
  name: p.full_name || p.email,
  color: p.color,
});

/**
 * Team view — visibility is role-scoped (and enforced by RLS underneath):
 *   - regular employee → only their own tasks
 *   - team lead        → every task in their department(s)
 *   - admin / HR        → all tasks, everywhere
 */
export default async function TeamTasksPage() {
  const access = await getUserAccess();
  if (!access) redirect("/login");
  const me = access.profile.id;
  const myDeptIds = access.departmentIds;
  const supabase = await createClient();

  const [{ data: allDepts }, { data: profs }] = await Promise.all([
    supabase.from("departments").select("id, name, slug").order("name"),
    supabase
      .from("profiles")
      .select("id, full_name, email, color")
      .is("deactivated_at", null)
      .order("full_name", { nullsFirst: false }),
  ]);
  const allDepartments = (allDepts ?? []) as DeptRef[];
  const myDepartments = allDepartments.filter((d) => myDeptIds.includes(d.id));
  const people = ((profs ?? []) as ProfileRow[]).map(toPerson);

  // Build the query per role. (RLS returns only what each role may see anyway,
  // so this is the UI matching the data boundary — not the only enforcement.)
  let query = supabase
    .from("tasks")
    .select(TASK_LIST_COLUMNS)
    .eq("archived", false);
  if (access.canManageUsers) {
    // all tasks
  } else if (access.isTeamLead && myDeptIds.length > 0) {
    query = query.in("department_id", myDeptIds);
  } else {
    query = query.or(`created_by.eq.${me},assigned_to.eq.${me}`);
  }
  const { data } = await query.order("created_at", { ascending: false });
  const tasks = (data ?? []) as Task[];

  const description = access.canManageUsers
    ? "Every task across all departments."
    : access.isTeamLead
      ? "Tasks across your department — see what everyone's working on."
      : "Your tasks. Only you (and your team lead) can see them.";

  // Managers can filter by any department; team leads by their own (if >1);
  // employees have nothing to filter (it's just their own tasks).
  const filterDepartments = access.canManageUsers ? allDepartments : myDepartments;

  return (
    <>
      <PageHeader title="Team" description={description} />
      <TaskList
        tasks={tasks}
        people={people}
        departments={filterDepartments}
        todayISO={localDateISO()}
        filters={{
          person: access.canManageUsers || access.isTeamLead,
          department: filterDepartments.length > 1,
        }}
      />
    </>
  );
}
