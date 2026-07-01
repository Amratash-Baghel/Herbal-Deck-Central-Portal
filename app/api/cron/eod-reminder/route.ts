import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyUsers } from "@/lib/notifications";
import { localDateISO } from "@/lib/time";

/**
 * Daily EOD reminder. Triggered by Vercel Cron (see `vercel.json`, scheduled
 * for 17:55 IST) — not tied to any user session, so it runs whether or not
 * anyone is using the app.
 *
 * Notifies every active employee who has not yet submitted today's end-of-day
 * report (`eod_reports` has no row for them for today). Runs with the
 * service-role client since there is no signed-in user for a cron request.
 *
 * Auth: Vercel automatically sends `Authorization: Bearer <CRON_SECRET>` for
 * configured Cron Jobs when the `CRON_SECRET` environment variable is set —
 * that's what's checked here, so this endpoint can't be triggered externally.
 */
export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!expected || authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const today = localDateISO();

  // Daily housekeeping: move "Done" tasks older than 7 days off the board
  // (archived = true) while keeping them in history. Best-effort.
  const { data: archived } = await admin.rpc("archive_stale_done_tasks");

  const [{ data: profiles }, { data: submitted }] = await Promise.all([
    admin.from("profiles").select("id").is("deactivated_at", null),
    admin.from("eod_reports").select("employee_id").eq("report_date", today),
  ]);

  const submittedIds = new Set((submitted ?? []).map((r) => r.employee_id as string));
  const pending = (profiles ?? [])
    .map((p) => p.id as string)
    .filter((id) => !submittedIds.has(id));

  if (pending.length === 0) {
    return NextResponse.json({ notified: 0 });
  }

  // Guard against a duplicate invocation (a Vercel retry, a manual re-run)
  // re-spamming the same people — skip anyone already reminded very recently.
  const since = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();
  const { data: recentReminders } = await admin
    .from("notifications")
    .select("recipient_id")
    .eq("type", "eod_reminder")
    .in("recipient_id", pending)
    .gte("created_at", since);
  const alreadyReminded = new Set(
    (recentReminders ?? []).map((r) => r.recipient_id as string),
  );
  const toNotify = pending.filter((id) => !alreadyReminded.has(id));

  await notifyUsers(
    toNotify.map((recipientId) => ({
      recipientId,
      type: "eod_reminder" as const,
      title: "Time to submit your EOD report",
      body: "Wrap up your day — log what you did and add a note if you'd like.",
      link: "/tasks/reports",
    })),
  );

  return NextResponse.json({
    notified: toNotify.length,
    pending: pending.length,
    archived: archived ?? 0,
  });
}
