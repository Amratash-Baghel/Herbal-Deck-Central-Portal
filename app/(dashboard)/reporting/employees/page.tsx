import { getUserAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import {
  EmployeeReviewList,
  type ReviewListRow,
} from "@/components/reporting/employee-review-list";
import { computeTaskStats, TASK_STAT_COLUMNS, type TaskLite } from "@/lib/reporting";
import { isoDaysAgo } from "@/lib/time";

type ProfileRow = { id: string; full_name: string | null; email: string };
type TaskRow = TaskLite & { assigned_to: string | null };

const ROSTER_WINDOW_DAYS = 30;

/**
 * Employee Reviews index — a searchable roster; pick anyone to drill into their
 * activity, task history, EOD reports, and stats. Admins + HR see everyone;
 * team leads see only their own department(s).
 */
export default async function EmployeeReviewsPage() {
  const access = await getUserAccess();
  const scopeDeptIds =
    access && !access.canManageUsers ? new Set(access.departmentIds) : null;
  const supabase = await createClient();

  const sinceTs = isoDaysAgo(ROSTER_WINDOW_DAYS);
  const [{ data: profs }, { data: depts }, { data: membs }, { data: openRows }, { data: doneRows }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, email")
        .is("deactivated_at", null)
        .order("full_name", { nullsFirst: false }),
      supabase.from("departments").select("id, name"),
      supabase.from("profile_departments").select("profile_id, department_id"),
      supabase
        .from("tasks")
        .select(TASK_STAT_COLUMNS)
        .neq("status", "done")
        .eq("archived", false),
      supabase
        .from("tasks")
        .select(TASK_STAT_COLUMNS)
        .eq("status", "done")
        .gte("completed_at", sinceTs),
    ]);

  // Group tasks by assignee so each person's signals can be computed once.
  const groupByAssignee = (tasks: TaskRow[]) => {
    const m = new Map<string, TaskLite[]>();
    for (const t of tasks) {
      if (!t.assigned_to) continue;
      const list = m.get(t.assigned_to) ?? [];
      list.push(t);
      m.set(t.assigned_to, list);
    }
    return m;
  };
  const openByPerson = groupByAssignee((openRows ?? []) as TaskRow[]);
  const doneByPerson = groupByAssignee((doneRows ?? []) as TaskRow[]);

  const deptNameById = new Map(
    ((depts ?? []) as { id: string; name: string }[]).map((d) => [d.id, d.name]),
  );
  const deptsByPerson = new Map<string, string[]>();
  const deptIdsByPerson = new Map<string, string[]>();
  for (const m of (membs ?? []) as { profile_id: string; department_id: string }[]) {
    const list = deptsByPerson.get(m.profile_id) ?? [];
    const name = deptNameById.get(m.department_id);
    if (name) list.push(name);
    deptsByPerson.set(m.profile_id, list);
    const ids = deptIdsByPerson.get(m.profile_id) ?? [];
    ids.push(m.department_id);
    deptIdsByPerson.set(m.profile_id, ids);
  }

  let people = (profs ?? []) as ProfileRow[];
  if (scopeDeptIds) {
    people = people.filter((p) =>
      (deptIdsByPerson.get(p.id) ?? []).some((id) => scopeDeptIds.has(id)),
    );
  }

  const rows: ReviewListRow[] = people.map((p) => {
    const s = computeTaskStats(openByPerson.get(p.id) ?? [], doneByPerson.get(p.id) ?? []);
    return {
      id: p.id,
      name: p.full_name || p.email,
      email: p.email,
      departmentNames: deptsByPerson.get(p.id) ?? [],
      open: s.open,
      overdue: s.overdue,
      onTimeRate: s.onTimeRate,
      completed: s.completed,
    };
  });

  return (
    <>
      <PageHeader
        title="Employee Reviews"
        description="Task load and reliability at a glance — pick a person to open their full review."
      />
      <EmployeeReviewList rows={rows} windowDays={ROSTER_WINDOW_DAYS} />
    </>
  );
}
