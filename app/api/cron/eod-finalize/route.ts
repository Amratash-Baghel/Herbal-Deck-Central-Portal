import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { localDateISO } from "@/lib/time";

/**
 * End-of-day finalisation — runs at 18:00 IST (see `vercel.json`), 30 minutes
 * after the EOD reminder.
 *
 *   1. Marks attendance INCOMPLETE for anyone who was active today but never
 *      submitted their EOD (they were warned by the 17:30 reminder). Shown in
 *      the Reporting module.
 *   2. Daily housekeeping: archives "Done" tasks older than 7 days off the
 *      board (kept in history).
 *
 * Protected by the same `CRON_SECRET` bearer token Vercel sends automatically.
 */
export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!expected || authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const today = localDateISO();

  const [{ data: incomplete }, { data: archived }] = await Promise.all([
    admin.rpc("finalize_incomplete_attendance", { d: today }),
    admin.rpc("archive_stale_done_tasks"),
  ]);

  return NextResponse.json({
    markedIncomplete: incomplete ?? 0,
    archived: archived ?? 0,
  });
}
