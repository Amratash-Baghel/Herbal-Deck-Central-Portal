import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { TaskList } from "@/components/tasks/task-list";
import { localDateISO } from "@/lib/time";
import type { Task } from "@/lib/types";
import type { Person, DeptRef } from "@/components/tasks/types";

type ProfileRow = { id: string; full_name: string | null; email: string };
const toPerson = (p: ProfileRow): Person => ({ id: p.id, name: p.full_name || p.email });

/**
 * Team view — every task across the departments the user belongs to, read-only.
 * Filter by team member (and by department when the user is in more than one).
 */
export default async function TeamTasksPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const me = profile.id;

  const { data: pdRows } = await supabase
    .from("profile_departments")
    .select("department_id")
    .eq("profile_id", me);
  const myDeptIds = (pdRows ?? []).map((r) => r.department_id as string);

  const [{ data: allDepts }, { data: profs }] = await Promise.all([
    supabase.from("departments").select("id, name, slug").order("name"),
    supabase
      .from("profiles")
      .select("id, full_name, email")
      .is("deactivated_at", null)
      .order("full_name", { nullsFirst: false }),
  ]);
  const allDepartments = (allDepts ?? []) as DeptRef[];
  const myDepartments = allDepartments.filter((d) => myDeptIds.includes(d.id));
  const people = ((profs ?? []) as ProfileRow[]).map(toPerson);

  let tasks: Task[] = [];
  if (myDeptIds.length > 0) {
    const { data } = await supabase
      .from("tasks")
      .select("*")
      .in("department_id", myDeptIds)
      .eq("archived", false);
    tasks = (data ?? []) as Task[];
  }

  return (
    <>
      <PageHeader
        title="Team"
        description="Tasks across your department — see what everyone's working on."
      />
      {myDeptIds.length === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
          You&apos;re not in a department yet — ask an admin to add you.
        </p>
      ) : (
        <TaskList
          tasks={tasks}
          people={people}
          departments={myDepartments}
          todayISO={localDateISO()}
          filters={{ person: true, department: myDepartments.length > 1 }}
        />
      )}
    </>
  );
}
