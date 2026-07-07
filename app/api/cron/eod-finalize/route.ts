import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyUsers, type NewNotification } from "@/lib/notifications";
import { localDateISO } from "@/lib/time";

/**
 * End-of-day finalisation — runs at 18:00 IST (see `vercel.json`), 30 minutes
 * after the EOD reminder.
 *
 *   1. Marks attendance INCOMPLETE for anyone who was active today but never
 *      submitted their EOD (they were warned by the 17:30 reminder).
 *   2. Task deadline notifications:
 *        - due tomorrow  → remind the assignee
 *        - overdue       → notify the assignee AND their department's team lead(s)
 *   3. Daily housekeeping: archives "Done" tasks older than 7 days.
 *
 * Protected by the same `CRON_SECRET` bearer token Vercel sends automatically.
 */
type TaskRow = {
  id: string;
  title: string;
  assigned_to: string | null;
  department_id: string;
};

export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!expected || authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const today = localDateISO();
  const tomorrow = localDateISO("Asia/Kolkata", new Date(Date.now() + 86_400_000));

  // Sunday is a non-working day: never flag attendance as incomplete on Sundays.
  const isSunday = new Date(`${today}T00:00:00Z`).getUTCDay() === 0;

  const [{ data: incomplete }, { data: archived }, { data: dueSoon }, { data: overdue }] =
    await Promise.all([
      isSunday
        ? Promise.resolve({ data: 0 })
        : admin.rpc("finalize_incomplete_attendance", { d: today }),
      admin.rpc("archive_stale_done_tasks"),
      admin
        .from("tasks")
        .select("id, title, assigned_to, department_id")
        .eq("deadline", tomorrow)
        .neq("status", "done")
        .eq("archived", false)
        .not("assigned_to", "is", null),
      admin
        .from("tasks")
        .select("id, title, assigned_to, department_id")
        .lt("deadline", today)
        .neq("status", "done")
        .eq("archived", false)
        .not("assigned_to", "is", null),
    ]);

  const notifications: NewNotification[] = [];

  // Due tomorrow → the assignee.
  for (const t of (dueSoon ?? []) as TaskRow[]) {
    if (!t.assigned_to) continue;
    notifications.push({
      recipientId: t.assigned_to,
      type: "task_due_soon",
      title: "Task due tomorrow",
      body: `Task "${t.title}" is due tomorrow`,
      link: "/tasks",
      data: { taskId: t.id },
    });
  }

  // Overdue → the assignee + their department's team lead(s).
  const overdueTasks = (overdue ?? []) as TaskRow[];
  if (overdueTasks.length > 0) {
    // Map department → active team-lead ids (one query each, then join).
    const deptIds = [...new Set(overdueTasks.map((t) => t.department_id))];
    const { data: leadIds } = await admin
      .from("profiles")
      .select("id")
      .eq("role", "team_lead")
      .is("deactivated_at", null);
    const leadSet = new Set((leadIds ?? []).map((r) => r.id as string));
    const { data: memb } = await admin
      .from("profile_departments")
      .select("profile_id, department_id")
      .in("department_id", deptIds);
    const leadsByDept = new Map<string, string[]>();
    for (const m of (memb ?? []) as { profile_id: string; department_id: string }[]) {
      if (!leadSet.has(m.profile_id)) continue;
      const list = leadsByDept.get(m.department_id) ?? [];
      list.push(m.profile_id);
      leadsByDept.set(m.department_id, list);
    }

    for (const t of overdueTasks) {
      const recipients = new Set<string>();
      if (t.assigned_to) recipients.add(t.assigned_to);
      for (const lead of leadsByDept.get(t.department_id) ?? []) recipients.add(lead);
      for (const recipientId of recipients) {
        notifications.push({
          recipientId,
          type: "task_overdue",
          title: "Task overdue",
          body: `Task "${t.title}" is overdue`,
          link: "/tasks",
          data: { taskId: t.id },
        });
      }
    }
  }

  await notifyUsers(notifications);

  return NextResponse.json({
    markedIncomplete: incomplete ?? 0,
    archived: archived ?? 0,
    dueSoon: (dueSoon ?? []).length,
    overdue: overdueTasks.length,
    notificationsSent: notifications.length,
  });
}
