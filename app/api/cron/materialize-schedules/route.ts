import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { localDateISO } from "@/lib/time";

/**
 * Materialise scheduled tasks for today across the whole company — so a
 * recurring task exists on everyone's board (and in Team/Manage views) at the
 * start of the working day, even before the person logs in. Each user's own
 * board also materialises on load, so this cron is a completeness backstop.
 *
 * Runs early each morning IST (see `vercel.json`). Idempotent: the unique
 * (schedule_id, assigned_to, schedule_date) index means re-running never
 * duplicates a task. Protected by the same `CRON_SECRET` bearer token Vercel
 * sends automatically.
 */
export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!expected || authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const today = localDateISO();
  const { data, error } = await admin.rpc("materialize_scheduled_tasks", { d: today });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ date: today, created: data ?? 0 });
}
