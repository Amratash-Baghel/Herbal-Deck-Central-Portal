import { redirect } from "next/navigation";
import { getUserAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { TaskBoard } from "@/components/tasks/task-board";
import { EodQuickSubmit } from "@/components/tasks/eod-quick-submit";
import type { Person, DeptRef } from "@/components/tasks/types";
import { time } from "@/lib/perf";
import { localDateISO } from "@/lib/time";
import { TASK_LIST_COLUMNS, type Task } from "@/lib/types";

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string;
  avatar_path: string | null;
  note_color: string | null;
};
const toPerson = (p: ProfileRow): Person => ({
  id: p.id,
  name: p.full_name || p.email,
  avatarPath: p.avatar_path,
  noteColor: p.note_color,
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
  const today = localDateISO();
  // The caller's departments already came with their profile (getUserAccess).
  const myDeptIds = access.departmentIds;
  const canManage = access.canManageUsers;
  const leadsTeam = !canManage && access.isTeamLead && myDeptIds.length > 0;

  const boardTasks = () =>
    supabase
      .from("tasks")
      .select(TASK_LIST_COLUMNS)
      .or(`created_by.eq.${me},assigned_to.eq.${me}`)
      .eq("archived", false)
      .order("created_at", { ascending: false });

  // Bring any scheduled tasks due today onto the board (idempotent), so a
  // recurring task shows up the moment its owner opens their board. It runs
  // alongside the reads rather than before them: it returns how many tasks it
  // created, and on the rare load where that isn't zero (the first board open
  // of the day for someone with a schedule) the board is read again after it.
  const [
    created,
    [
      { data: allDepts },
      { data: profs },
      { data: firstTaskRows },
      { data: historyRows },
      { data: todayReport },
      { data: memberRows },
    ],
  ] = await Promise.all([
    supabase.rpc("materialize_my_scheduled_tasks").then(
      ({ data }) => Number(data) || 0,
      () => 0,
    ),
    time("tasks:board-queries", () =>
      Promise.all([
        supabase.from("departments").select("id, name, slug").order("name"),
        supabase
          .from("profiles")
          .select("id, full_name, email, avatar_path, note_color")
          .is("deactivated_at", null)
          .order("full_name", { nullsFirst: false }),
        boardTasks(),
        // The History column: completed tasks the nightly cron archived off the
        // board after a week. Bounded — this only ever grows.
        supabase
          .from("tasks")
          .select(TASK_LIST_COLUMNS)
          .or(`created_by.eq.${me},assigned_to.eq.${me}`)
          .eq("archived", true)
          .eq("status", "done")
          .order("completed_at", { ascending: false })
          .limit(50),
        // Today's EOD, so the header button opens the note already written
        // rather than a blank box.
        supabase
          .from("eod_reports")
          .select("manual_note")
          .eq("employee_id", me)
          .eq("report_date", today)
          .maybeSingle(),
        // A team lead can assign to anyone in their department(s).
        leadsTeam
          ? supabase
              .from("profile_departments")
              .select("profile_id")
              .in("department_id", myDeptIds)
          : Promise.resolve({ data: null }),
      ]),
    ),
  ]);
  const taskRows = created > 0 ? (await boardTasks()).data : firstTaskRows;

  const allDepartments: DeptRef[] = (allDepts ?? []) as DeptRef[];
  const myDepartments = allDepartments.filter((d) => myDeptIds.includes(d.id));

  const people = ((profs ?? []) as ProfileRow[]).map(toPerson);

  // Who can this person assign tasks to?
  //   admin / HR → anyone;  team lead → their department(s);  employee → self.
  let assignable: Person[];
  if (canManage) {
    assignable = people;
  } else if (leadsTeam) {
    const ids = new Set<string>([me]);
    for (const r of (memberRows ?? []) as { profile_id: string }[]) ids.add(r.profile_id);
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
        action={
          // Everyone who files an EOD gets the shortcut — employees, team
          // leads, HR & Management. Owner-level accounts don't file one.
          !access.isAdmin && (
            <EodQuickSubmit
              initialNote={(todayReport as { manual_note: string | null } | null)?.manual_note ?? ""}
              alreadySubmitted={Boolean(todayReport)}
            />
          )
        }
      />
      <TaskBoard
        me={toPerson(profile)}
        canManage={canManage}
        canAssignOthers={access.canManageUsers || access.isTeamLead}
        initialTasks={(taskRows ?? []) as Task[]}
        initialHistory={(historyRows ?? []) as Task[]}
        todayISO={today}
        people={people}
        assignable={assignable}
        departments={myDepartments}
        allDepartments={allDepartments}
      />
    </>
  );
}
