import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { NewLine, ROW, StampDone } from "@/components/dashboard/sheet";
import { EodNoteForm } from "@/components/tasks/eod-note-form";
import { getUserAccess } from "@/lib/auth";
import { time } from "@/lib/perf";
import { createClient } from "@/lib/supabase/server";
import { dayRangeUTC, formatHM, localDateISO } from "@/lib/time";
import type { EodReport } from "@/lib/types";

const TZ = "Asia/Kolkata";
const TIME_CELL = "border-r pt-2.5 pr-3 text-right text-xs tabular-nums";

/**
 * Today's sheet.
 *
 * People here don't manage tasks — at the end of the day they write down what
 * they did, one line at a time. So the page is the sheet they write on: a ruled
 * time column, their lines in the largest type on the page, and an open row at
 * the bottom with the cursor in it.
 *
 * A line that is finished carries a time. A line that isn't carries a dash.
 * That column is the only status indicator, which is why there are no badges,
 * chips or colour dots anywhere on this page.
 */
export default async function DashboardPage() {
  const access = await getUserAccess();
  if (!access) redirect("/login");

  const me = access.profile.id;
  const today = localDateISO();
  const supabase = await createClient();

  const { data: reportRow } = await time("dashboard:report", () =>
    supabase
      .from("eod_reports")
      .select("*")
      .eq("employee_id", me)
      .eq("report_date", today)
      .maybeSingle(),
  );
  const report = (reportRow as EodReport | null) ?? null;

  const dateLine = new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: TZ,
  }).format(new Date());

  return (
    <div className="mx-auto max-w-2xl pb-16">
      <h1 className="text-sm text-muted-foreground">{dateLine}</h1>

      <Suspense fallback={<Skeleton />}>
        <Sheet me={me} today={today} />
      </Suspense>

      <Suspense fallback={null}>
        <Unread />
      </Suspense>

      <SignOff report={report} />

      {access.canViewReports && (
        <Suspense fallback={null}>
          <Outstanding today={today} />
        </Suspense>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------- sheet */

type Line = {
  id: string;
  title: string;
  status: string;
  created_at: string;
  completed_at: string | null;
};

/**
 * Everything on your sheet today: what you finished (with its time) and what is
 * still open (with a dash), oldest first, the way a logbook reads.
 */
async function Sheet({ me, today }: { me: string; today: string }) {
  const supabase = await createClient();
  const { startISO } = dayRangeUTC(today, TZ);

  const { data } = await time("dashboard:sheet", () =>
    supabase
      .from("tasks")
      .select("id, title, status, created_at, completed_at")
      .eq("assigned_to", me)
      .eq("archived", false)
      // Finished today, or still open from any day — both belong on the sheet.
      .or(`status.neq.done,completed_at.gte.${startISO}`)
      .order("created_at", { ascending: true }),
  );

  const rows = (data ?? []) as Line[];
  const done = rows
    .filter((t) => t.completed_at)
    .sort((a, b) => (a.completed_at! < b.completed_at! ? -1 : 1));
  const open = rows.filter((t) => !t.completed_at);
  const lines = [...done, ...open];

  return (
    <section className="mt-2">
      <ol className="border-t pt-1">
        {lines.map((line) => (
          <li key={line.id} className={ROW}>
            <span
              className={`${TIME_CELL} ${
                line.completed_at ? "text-muted-foreground" : "border-dashed text-border"
              }`}
            >
              {line.completed_at ? formatHM(line.completed_at, TZ) : "—"}
            </span>
            <span className="flex items-start justify-between gap-3 py-2 pl-4">
              <span
                className={`text-base leading-snug md:text-lg ${
                  line.completed_at ? "" : "text-muted-foreground"
                }`}
              >
                {line.title}
              </span>
              {!line.completed_at && <StampDone id={line.id} />}
            </span>
          </li>
        ))}

        <NewLine first={lines.length === 0} />
      </ol>

      <p className="mt-2 flex items-baseline justify-between gap-4 text-xs text-muted-foreground">
        <span>
          {done.length === 0
            ? "Nothing logged yet."
            : `${done.length} ${done.length === 1 ? "line" : "lines"} today`}
          {open.length > 0 && ` · ${open.length} still open`}
        </span>
        <Link
          href="/tasks"
          className="rounded text-primary transition hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-ring"
        >
          Your board
        </Link>
      </p>
    </section>
  );
}

/* ----------------------------------------------------------------- sign off */

/** Closing the page: a rule, the time it was signed, and the note. */
function SignOff({ report }: { report: EodReport | null }) {
  if (report) {
    const at = formatHM(report.updated_at ?? report.created_at, TZ);
    return (
      <section className="mt-10 border-t-2 border-primary pt-3">
        <p className="text-sm">
          <span className="font-medium">Signed off at {at}</span>
          <span className="text-muted-foreground"> — today&rsquo;s report is with your manager.</span>
        </p>
        {report.manual_note && (
          <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
            {report.manual_note}
          </p>
        )}
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-primary dark:text-ring">
            Change the note
          </summary>
          <EodNoteForm initialNote={report.manual_note ?? ""} alreadySubmitted />
        </details>
      </section>
    );
  }

  return (
    <section className="mt-10 border-t pt-3">
      <EodNoteForm initialNote="" alreadySubmitted={false} />
    </section>
  );
}

/* ------------------------------------------------------------------- unread */

/** One line, only when someone is actually waiting on a reply. */
async function Unread() {
  const supabase = await createClient();
  const { data } = await time("dashboard:unread", () => supabase.rpc("unread_counts"));
  const rows = (data ?? []) as { conversation_id: string; unread: number }[];
  const total = rows.reduce((n, r) => n + Number(r.unread), 0);
  if (total === 0) return null;

  return (
    <p className="mt-6 text-sm">
      <Link
        href="/chat"
        className="rounded text-primary transition hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-ring"
      >
        {total} unread {total === 1 ? "message" : "messages"} in chat
      </Link>
    </p>
  );
}

/* -------------------------------------------------------------- outstanding */

/**
 * Managers only, and only the part a manager has to act on: who hasn't filed
 * yet. The ones who have need no attention, so they aren't listed.
 */
async function Outstanding({ today }: { today: string }) {
  const supabase = await createClient();
  const [{ data: filedRows }, { data: profRows }] = await time("dashboard:outstanding", () =>
    Promise.all([
      supabase.from("eod_reports").select("employee_id").eq("report_date", today),
      supabase
        .from("profiles")
        .select("id, full_name, email")
        .is("deactivated_at", null)
        .order("full_name", { nullsFirst: false }),
    ]),
  );

  const people = (profRows ?? []) as { id: string; full_name: string | null; email: string }[];
  if (people.length === 0) return null;

  const filed = new Set(((filedRows ?? []) as { employee_id: string }[]).map((r) => r.employee_id));
  const missing = people.filter((p) => !filed.has(p.id));

  return (
    <section className="mt-10 border-t pt-3">
      <p className="flex items-baseline justify-between gap-4 text-sm">
        <span>
          <span className="tabular-nums font-medium">
            {filed.size} of {people.length}
          </span>
          <span className="text-muted-foreground"> reports in</span>
        </span>
        <Link
          href="/tasks/reports"
          className="rounded text-primary transition hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-ring"
        >
          Read them
        </Link>
      </p>
      {missing.length > 0 && (
        <p className="mt-1.5 text-sm text-muted-foreground">
          Still to file: {missing.map((p) => p.full_name || p.email).join(", ")}
        </p>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------- skeletons */

/** Matches the sheet's row rhythm so nothing jumps when it arrives. */
function Skeleton() {
  return (
    <div className="mt-2 border-t pt-1" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className={ROW}>
          <span className={`${TIME_CELL} text-transparent`}>00:00</span>
          <span className="py-2 pl-4">
            <span className="block h-5 w-full max-w-sm animate-pulse rounded bg-muted md:h-6" />
          </span>
        </div>
      ))}
    </div>
  );
}
