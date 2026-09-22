import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Avatar } from "@/components/avatar";
import { QuickAdd } from "@/components/dashboard/quick-add";
import { TaskRow } from "@/components/dashboard/task-row";
import { EodNoteForm } from "@/components/tasks/eod-note-form";
import { getUserAccess } from "@/lib/auth";
import { time } from "@/lib/perf";
import { createClient } from "@/lib/supabase/server";
import { noteColor } from "@/lib/tasks";
import { daysUntil, formatClockTZ, localDateISO } from "@/lib/time";
import type { Conversation, EodReport, EodSummary, Task } from "@/lib/types";

const TZ = "Asia/Kolkata";

/**
 * The day spine.
 *
 * The three things you act on hang off a rail as beats of the working day, in
 * the order the day is actually worked: you arrived, close out, what is still
 * on your plate. Each beat's node fills in once that beat is clear, so the rail
 * reads as a status column rather than a border — glance at it and you know how
 * much of the day is still open. What you only read (unread chat, whose reports
 * are in) sits beside the spine on a wide display and under it on a narrow one.
 *
 * The page resolves only two things itself (did I file today, when did I first
 * show up) so the spine paints immediately; the heavier reads stream in
 * sibling Suspense boundaries.
 */
export default async function DashboardPage() {
  const access = await getUserAccess();
  if (!access) redirect("/login");

  const me = access.profile.id;
  const today = localDateISO();
  const supabase = await createClient();

  const [{ data: reportRow }, { data: logRow }] = await time("dashboard:day", () =>
    Promise.all([
      supabase
        .from("eod_reports")
        .select("*")
        .eq("employee_id", me)
        .eq("report_date", today)
        .maybeSingle(),
      supabase
        .from("activity_logs")
        .select("first_seen_at")
        .eq("employee_id", me)
        .eq("date", today)
        .maybeSingle(),
    ]),
  );

  const report = (reportRow as EodReport | null) ?? null;
  const openedAt = (logRow as { first_seen_at: string | null } | null)?.first_seen_at;

  const now = new Date();
  const weekday = new Intl.DateTimeFormat("en-IN", { weekday: "long", timeZone: TZ }).format(now);
  const dateLine = new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "long",
    timeZone: TZ,
  }).format(now);

  // Greet by the hour where the office actually is, not the browser's guess.
  const hour =
    Number(
      new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: TZ }).format(now),
    ) % 24;
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = (access.profile.full_name || access.profile.email).split(/[\s@._-]+/)[0];
  const name = firstName.charAt(0).toUpperCase() + firstName.slice(1);

  return (
    <div className="mx-auto w-full max-w-[72rem]">
      <Beat done>
        <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
              {greeting}, {name}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {weekday}, {dateLine}
            </p>
          </div>
          {openedAt && (
            <p className="text-sm tabular-nums text-muted-foreground">
              Open since {formatClockTZ(openedAt, TZ)}
            </p>
          )}
        </header>
      </Beat>

      {/* Once the display is wide enough for two readable columns, the things
          you act on stay on the spine and the things you only glance at move
          beside it — the width gets filled with information rather than by
          stretching rows until their button is a hand's width from their
          title. The aside track is fit-content, so it takes no space at all
          for someone with no unread and no reports to read. */}
      <div className="xl:grid xl:grid-cols-[minmax(0,38rem)_fit-content(20rem)] xl:gap-x-10 2xl:grid-cols-[minmax(0,42rem)_fit-content(24rem)] 2xl:gap-x-12">
        <div>
          <Suspense fallback={<BeatSkeleton className="h-44" />}>
            <CloseOut me={me} today={today} report={report} />
          </Suspense>

          <Suspense fallback={<BeatSkeleton className="h-56" />}>
            <Plate
              me={me}
              meName={access.profile.full_name || access.profile.email}
              myNoteColor={access.profile.note_color}
              canAssignOthers={access.canManageUsers || access.isTeamLead}
            />
          </Suspense>
        </div>

        {/* Stacked under the spine on a narrow screen, so it keeps the rail's
            indent there and drops it once it is a column of its own. */}
        <aside className="space-y-10 pb-10 pl-[30px] md:pl-[38px] xl:pt-1 xl:pb-0 xl:pl-0">
          <Suspense fallback={null}>
            <Unread me={me} />
          </Suspense>

          {access.canViewReports && (
            <Suspense
              fallback={
                <div
                  className="h-28 w-full animate-pulse rounded-2xl bg-muted xl:w-[20rem] 2xl:w-[24rem]"
                  aria-hidden="true"
                />
              }
            >
              <Team today={today} />
            </Suspense>
          )}
        </aside>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- the rail */

/**
 * One beat hung off the day rail. `done` fills the node and the line below it,
 * so the rail is a column of answers rather than decoration. Only the beats you
 * act on get one — the rail tracks your day, not everything on the page.
 */
function Beat({ done = false, children }: { done?: boolean; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[14px_minmax(0,1fr)] gap-x-4 md:gap-x-6">
      <div className="relative flex justify-center" aria-hidden="true">
        <span
          className={`absolute top-3 bottom-0 w-px ${done ? "bg-primary/40" : "bg-border"}`}
        />
        <span
          className={`relative mt-1 h-3.5 w-3.5 rounded-full border-2 transition-colors ${
            done ? "border-primary bg-primary" : "border-border bg-background"
          }`}
        />
      </div>
      <div className="min-w-0 pb-10">{children}</div>
    </div>
  );
}

/** A section heading with its count and the link out to the full thing. */
function Heading({
  title,
  count,
  href,
  action,
}: {
  title: string;
  count: React.ReactNode;
  href: string;
  action: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <h2 className="text-base font-semibold tracking-tight">
        {title}
        <span className="ml-2 text-sm font-normal tabular-nums text-muted-foreground">{count}</span>
      </h2>
      <Link
        href={href}
        className="shrink-0 rounded text-sm text-primary transition hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-ring"
      >
        {action}
      </Link>
    </div>
  );
}

/* ---------------------------------------------------------------- close out */

async function CloseOut({
  me,
  today,
  report,
}: {
  me: string;
  today: string;
  report: EodReport | null;
}) {
  const supabase = await createClient();
  const { data } = await time("dashboard:eod-summary", () =>
    supabase.rpc("eod_summary", { emp: me, d: today }),
  );
  const summary = (data as EodSummary | null) ?? {
    created: 0,
    in_progress: 0,
    completed: 0,
    pending: 0,
  };
  const line = dayLine(summary);

  // Filing is the one moment on this page worth a bold surface: the card goes
  // solid, and it is the only filled block anywhere in the layout.
  if (report) {
    const at = formatClockTZ(report.updated_at ?? report.created_at, TZ);
    return (
      <Beat done>
        <section className="rounded-2xl bg-primary p-5 text-primary-foreground shadow-sm">
          <h2 className="text-lg font-semibold tracking-tight">Day closed out at {at}</h2>
          <p className="mt-1 text-sm text-primary-foreground/75">{line}</p>
          {report.manual_note && (
            <p className="mt-3 whitespace-pre-wrap text-sm text-primary-foreground/90">
              {report.manual_note}
            </p>
          )}
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium underline decoration-primary-foreground/40 underline-offset-4 transition hover:decoration-primary-foreground">
              Edit today&rsquo;s report
            </summary>
            <div className="mt-2 rounded-xl bg-background p-3 text-foreground">
              <EodNoteForm initialNote={report.manual_note ?? ""} alreadySubmitted />
            </div>
          </details>
        </section>
      </Beat>
    );
  }

  return (
    <Beat>
      <section className="rounded-2xl border bg-card p-5 shadow-sm">
        <h2 className="text-lg font-semibold tracking-tight">Close out your day</h2>
        <p className="mt-1 text-sm text-muted-foreground">{line}</p>
        <EodNoteForm initialNote="" alreadySubmitted={false} />
      </section>
    </Beat>
  );
}

/** "You finished 3, started 2 and added 1 today. 5 still open." */
function dayLine(s: EodSummary): string {
  const bits: string[] = [];
  if (s.completed) bits.push(`finished ${s.completed}`);
  if (s.in_progress) bits.push(`started ${s.in_progress}`);
  if (s.created) bits.push(`added ${s.created}`);

  const tail = s.pending ? ` ${s.pending} still open.` : "";
  if (bits.length === 0) return `Nothing logged yet today.${tail}`;

  const list =
    bits.length === 1 ? bits[0] : `${bits.slice(0, -1).join(", ")} and ${bits[bits.length - 1]}`;
  return `You ${list} today.${tail}`;
}

/* -------------------------------------------------------------------- plate */

type OpenTask = Pick<
  Task,
  "id" | "title" | "status" | "created_by" | "deadline" | "color" | "department_id"
>;

async function Plate({
  me,
  meName,
  myNoteColor,
  canAssignOthers,
}: {
  me: string;
  meName: string;
  myNoteColor: string | null;
  canAssignOthers: boolean;
}) {
  const supabase = await createClient();
  const { data } = await time("dashboard:plate", () =>
    supabase
      .from("tasks")
      .select("id, title, status, created_by, deadline, color, department_id")
      .eq("assigned_to", me)
      .eq("archived", false)
      .neq("status", "done")
      .order("created_at", { ascending: false }),
  );

  const tasks = (data ?? []) as OpenTask[];
  const running = tasks.filter((t) => t.status === "in_progress");
  const waiting = tasks.filter((t) => t.status === "todo" && t.created_by !== me);
  const own = tasks.filter((t) => t.status === "todo" && t.created_by === me);

  // Only look up names if something was actually handed to you.
  let senders = new Map<string, string>();
  if (waiting.length > 0) {
    const ids = [...new Set(waiting.map((t) => t.created_by))];
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", ids);
    senders = new Map(
      ((profs ?? []) as { id: string; full_name: string | null; email: string }[]).map((p) => [
        p.id,
        (p.full_name || p.email).split(/[\s@]+/)[0],
      ]),
    );
  }

  const row = (task: OpenTask, to: "in_progress" | "done", label: string, meta?: string | null) => (
    <TaskRow
      key={task.id}
      id={task.id}
      title={task.title}
      dotClass={noteColor(task.color, myNoteColor)}
      to={to}
      actionLabel={label}
      meta={meta ?? deadlineMeta(task.deadline)}
      href="/tasks"
    />
  );

  const shown = own.slice(0, 4);

  return (
    <Beat done={tasks.length === 0}>
      <section>
        <Heading
          title="On your plate"
          count={tasks.length}
          href="/tasks"
          action="Open your board"
        />

        <div className="mt-3 overflow-hidden rounded-2xl border bg-card shadow-sm">
          <QuickAdd
            me={{ id: me, name: meName, noteColor: myNoteColor }}
            canAssignOthers={canAssignOthers}
          />

          {tasks.length === 0 && (
            <p className="border-t px-4 py-4 text-sm text-muted-foreground">
              Nothing open. Add what you are working on and it lands on your board.
            </p>
          )}

          {running.length > 0 && (
            <Group title="In progress" count={running.length}>
              {running.map((t) => row(t, "done", "Mark done"))}
            </Group>
          )}

          {waiting.length > 0 && (
            <Group title="Sent to you" count={waiting.length}>
              {waiting.map((t) =>
                row(t, "in_progress", "Start", `from ${senders.get(t.created_by) ?? "a teammate"}`),
              )}
            </Group>
          )}

          {own.length > 0 && (
            <Group title="Your list" count={own.length}>
              {shown.map((t) => row(t, "in_progress", "Start"))}
            </Group>
          )}
        </div>

        {own.length > shown.length && (
          <p className="mt-2 text-sm text-muted-foreground">
            {own.length - shown.length} more on your board.
          </p>
        )}
      </section>
    </Beat>
  );
}

function deadlineMeta(deadline: string | null): string | null {
  const days = daysUntil(deadline, TZ);
  if (days === null) return null;
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "due today";
  if (days === 1) return "due tomorrow";
  return `due in ${days}d`;
}

function Group({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t">
      <h3 className="px-4 pt-3 pb-1 text-xs font-medium text-muted-foreground">
        {title} <span className="ml-0.5 tabular-nums">{count}</span>
      </h3>
      <ul className="pb-1.5">{children}</ul>
    </div>
  );
}

/* ------------------------------------------------------------------- unread */

async function Unread({ me }: { me: string }) {
  const supabase = await createClient();
  const { data: counts } = await time("dashboard:unread", () => supabase.rpc("unread_counts"));
  const rows = (counts ?? []) as { conversation_id: string; unread: number }[];
  if (rows.length === 0) return null;

  const ids = rows.map((r) => r.conversation_id);
  const [{ data: convRows }, { data: partRows }] = await time("dashboard:unread-detail", () =>
    Promise.all([
      supabase.from("conversations").select("id, type, name, last_message_preview").in("id", ids),
      supabase
        .from("conversation_participants")
        .select("conversation_id, profile_id")
        .in("conversation_id", ids),
    ]),
  );

  const parts = (partRows ?? []) as { conversation_id: string; profile_id: string }[];
  const otherIds = [...new Set(parts.map((p) => p.profile_id))].filter((id) => id !== me);
  const { data: profRows } = otherIds.length
    ? await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_path")
        .in("id", otherIds)
    : { data: [] };

  const people = new Map(
    ((profRows ?? []) as { id: string; full_name: string | null; email: string; avatar_path: string | null }[]).map(
      (p) => [p.id, p],
    ),
  );
  const unreadBy = new Map(rows.map((r) => [r.conversation_id, Number(r.unread)]));
  const otherIn = new Map<string, string>();
  for (const p of parts) {
    if (p.profile_id !== me && !otherIn.has(p.conversation_id)) {
      otherIn.set(p.conversation_id, p.profile_id);
    }
  }

  const convs = ((convRows ?? []) as Pick<
    Conversation,
    "id" | "type" | "name" | "last_message_preview"
  >[])
    .map((c) => {
      const other = people.get(otherIn.get(c.id) ?? "");
      return {
        id: c.id,
        label: c.type === "group" ? c.name || "Group" : other ? other.full_name || other.email : "Chat",
        avatarPath: c.type === "group" ? null : (other?.avatar_path ?? null),
        preview: c.last_message_preview,
        unread: unreadBy.get(c.id) ?? 0,
      };
    })
    .sort((a, b) => b.unread - a.unread);

  const total = convs.reduce((n, c) => n + c.unread, 0);

  return (
    <section>
      <Heading title="Waiting on you" count={total} href="/chat" action="Open chat" />
      <ul className="mt-3 overflow-hidden rounded-2xl border bg-card shadow-sm">
        {convs.slice(0, 3).map((c) => (
          <li key={c.id} className="border-t first:border-t-0">
            <Link
              href={`/chat?c=${c.id}`}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            >
              <Avatar
                name={c.label}
                path={c.avatarPath}
                className="h-9 w-9 rounded-full"
                fallbackClassName="bg-accent text-primary text-[11px] font-semibold"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] leading-5">{c.label}</span>
                {c.preview && (
                  <span className="block truncate text-xs text-muted-foreground">{c.preview}</span>
                )}
              </span>
              <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-xs font-medium tabular-nums text-primary-foreground">
                {c.unread}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* --------------------------------------------------------------------- team */

async function Team({ today }: { today: string }) {
  const supabase = await createClient();
  const [{ data: filedRows }, { data: profRows }] = await time("dashboard:team", () =>
    Promise.all([
      supabase.from("eod_reports").select("employee_id").eq("report_date", today),
      supabase
        .from("profiles")
        .select("id, full_name, email, avatar_path")
        .is("deactivated_at", null)
        .order("full_name", { nullsFirst: false }),
    ]),
  );

  const people = (profRows ?? []) as {
    id: string;
    full_name: string | null;
    email: string;
    avatar_path: string | null;
  }[];
  if (people.length === 0) return null;

  const done = new Set(((filedRows ?? []) as { employee_id: string }[]).map((r) => r.employee_id));
  const sorted = [...people].sort((a, b) => Number(done.has(b.id)) - Number(done.has(a.id)));
  const shown = sorted.slice(0, 16);
  const pct = Math.round((done.size / people.length) * 100);

  return (
    <section>
      <Heading
        title="Reports in"
        count={`${done.size} of ${people.length}`}
        href="/tasks/reports"
        action="Read today's reports"
      />
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
      <ul className="mt-3 flex flex-wrap gap-1.5">
        {shown.map((p) => {
          const name = p.full_name || p.email;
          const filed = done.has(p.id);
          return (
            <li key={p.id} title={filed ? `${name} — filed` : `${name} — nothing yet`}>
              <Avatar
                name={name}
                path={p.avatar_path}
                className={`h-8 w-8 rounded-full ${filed ? "" : "opacity-30 grayscale"}`}
                fallbackClassName="bg-accent text-primary text-[10px] font-semibold"
              />
            </li>
          );
        })}
        {sorted.length > shown.length && (
          <li className="flex h-8 items-center px-1 text-xs tabular-nums text-muted-foreground">
            +{sorted.length - shown.length}
          </li>
        )}
      </ul>
    </section>
  );
}

/* ---------------------------------------------------------------- skeletons */

function BeatSkeleton({ className }: { className: string }) {
  return (
    <Beat>
      <div className={`animate-pulse rounded-2xl bg-muted ${className}`} aria-hidden="true" />
    </Beat>
  );
}
