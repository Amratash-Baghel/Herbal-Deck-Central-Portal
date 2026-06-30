import { requireUserManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { TaskList } from "@/components/tasks/task-list";
import { localDateISO, isoDaysAgo } from "@/lib/time";
import type { Task } from "@/lib/types";
import type { Person, DeptRef } from "@/components/tasks/types";

type ProfileRow = { id: string; full_name: string | null; email: string };
const toPerson = (p: ProfileRow): Person => ({ id: p.id, name: p.full_name || p.email });

type OverviewRow = {
  employee_id: string;
  created: number;
  in_progress: number;
  completed: number;
  pending: number;
};

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * Manage — admins + HR & Management only. An all-departments dashboard: live
 * completion stats, people with no activity today, and a fully filterable
 * (department / person / status / date) view of every task.
 */
export default async function ManageTasksPage() {
  await requireUserManager();
  const supabase = await createClient();
  const today = localDateISO();
  const weekAgo = isoDaysAgo(7);

  const [
    { data: tasksData },
    { data: doneEvents },
    { data: overview },
    { data: profs },
    { data: depts },
  ] = await Promise.all([
    supabase.from("tasks").select("*").eq("archived", false),
    supabase
      .from("task_activity")
      .select("actor_id, created_at")
      .eq("action", "status_changed")
      .eq("to_status", "done")
      .gte("created_at", weekAgo),
    supabase.rpc("eod_overview", { d: today }),
    supabase
      .from("profiles")
      .select("id, full_name, email")
      .is("deactivated_at", null)
      .order("full_name", { nullsFirst: false }),
    supabase.from("departments").select("id, name, slug").order("name"),
  ]);

  const tasks = (tasksData ?? []) as Task[];
  const people = ((profs ?? []) as ProfileRow[]).map(toPerson);
  const departments = (depts ?? []) as DeptRef[];
  const nameOf = new Map(people.map((p) => [p.id, p.name]));

  // Completion tallies (this week / today) per person, from the activity log.
  const weekByPerson = new Map<string, number>();
  let completedToday = 0;
  for (const e of (doneEvents ?? []) as { actor_id: string | null; created_at: string }[]) {
    if (!e.actor_id) continue;
    weekByPerson.set(e.actor_id, (weekByPerson.get(e.actor_id) ?? 0) + 1);
    if (localDateISO("Asia/Kolkata", new Date(e.created_at)) === today) completedToday++;
  }
  const completedWeek = (doneEvents ?? []).length;

  const overviewRows = (overview ?? []) as OverviewRow[];
  const idle = overviewRows.filter(
    (r) => Number(r.created) + Number(r.in_progress) + Number(r.completed) === 0,
  );
  const activeToday = overviewRows.length - idle.length;
  const openTasks = tasks.filter((t) => t.status !== "done").length;

  const leaderboard = [...weekByPerson.entries()]
    .map(([id, n]) => ({ name: nameOf.get(id) ?? "Someone", count: n }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return (
    <>
      <PageHeader
        title="Manage"
        description="Every department, every task — completion stats and activity."
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Open tasks" value={openTasks} hint="To do + in progress" />
        <Stat label="Completed today" value={completedToday} />
        <Stat label="Completed this week" value={completedWeek} hint="Last 7 days" />
        <Stat
          label="Active today"
          value={`${activeToday}/${overviewRows.length}`}
          hint="People with task activity"
        />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* No activity today */}
        <div className="rounded-2xl border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-semibold tracking-tight">No activity today</h2>
          {idle.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Everyone has moved at least one task today. 🎉
            </p>
          ) : (
            <ul className="mt-3 flex flex-wrap gap-2">
              {idle.map((r) => (
                <li
                  key={r.employee_id}
                  className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300"
                >
                  {nameOf.get(r.employee_id) ?? "Someone"}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Completed this week leaderboard */}
        <div className="rounded-2xl border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-semibold tracking-tight">Most completed (7 days)</h2>
          {leaderboard.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No completions yet this week.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {leaderboard.map((row) => (
                <li key={row.name} className="flex items-center justify-between text-sm">
                  <span>{row.name}</span>
                  <span className="font-semibold">{row.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <TaskList
        tasks={tasks}
        people={people}
        departments={departments}
        todayISO={today}
        filters={{ person: true, department: true, status: true, dateRange: true }}
      />
    </>
  );
}
