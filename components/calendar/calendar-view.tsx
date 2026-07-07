"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EventDialog } from "@/components/calendar/event-dialog";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CalendarPlusIcon,
  CakeIcon,
  CloseIcon,
  TrashIcon,
  ExternalLinkIcon,
} from "@/components/icons";
import {
  EVENT_TYPE_META,
  monthGrid,
  parseMonthKey,
  shiftMonthKey,
  monthKeyLabel,
  monthDayKey,
  attendanceDot,
  WEEKDAY_LABELS,
} from "@/lib/calendar";
import { deleteCalendarEvent } from "@/app/(dashboard)/calendar/actions";
import type { CalendarEventType } from "@/lib/types";

export interface EventLite {
  id: string;
  title: string;
  description: string | null;
  event_type: CalendarEventType;
  event_time: string | null;
  creatorName: string;
  mine: boolean;
}

function fmtTime(t: string | null): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const period = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

function fmtLongDate(dateISO: string): string {
  return new Date(`${dateISO}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * A month calendar. Days carry coloured dots for the events visible to the user
 * (RLS-scoped), a cake for birthdays, and an attendance flag (late/absent/
 * incomplete) for the signed-in user. Clicking a day opens its detail: the day's
 * events, a way to add one, and — for today or a past day — a link to that day's
 * report.
 */
export function CalendarView({
  monthKey,
  todayISO,
  eventsByDate,
  birthdaysByKey,
  attendanceByDate,
  departments,
  allowedTypes,
}: {
  monthKey: string;
  todayISO: string;
  eventsByDate: Record<string, EventLite[]>;
  birthdaysByKey: Record<string, string[]>;
  attendanceByDate: Record<string, string>;
  departments: { id: string; name: string }[];
  allowedTypes: CalendarEventType[];
}) {
  const router = useRouter();
  const { year, month } = parseMonthKey(monthKey, todayISO);
  const grid = monthGrid(year, month);

  const [selected, setSelected] = useState<string | null>(null);
  const [addFor, setAddFor] = useState<string | null>(null);

  async function remove(id: string) {
    const res = await deleteCalendarEvent(id);
    if (res.ok) router.refresh();
  }

  const dayEvents = selected ? (eventsByDate[selected] ?? []) : [];
  const dayBirthdays = selected ? (birthdaysByKey[monthDayKey(selected)] ?? []) : [];

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Link
            href={`/calendar?m=${shiftMonthKey(monthKey, -1)}`}
            aria-label="Previous month"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border text-muted-foreground transition hover:bg-accent hover:text-foreground"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </Link>
          <span className="w-40 text-center text-sm font-semibold">{monthKeyLabel(monthKey)}</span>
          <Link
            href={`/calendar?m=${shiftMonthKey(monthKey, 1)}`}
            aria-label="Next month"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border text-muted-foreground transition hover:bg-accent hover:text-foreground"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </Link>
        </div>
        <Link
          href="/calendar"
          className="rounded-lg border px-2.5 py-1.5 text-xs font-medium transition hover:bg-accent"
        >
          Today
        </Link>
        <button
          type="button"
          onClick={() => setAddFor(todayISO)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-90"
        >
          <CalendarPlusIcon className="h-4 w-4" />
          Add event
        </button>
      </div>

      {/* Legend */}
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        {(Object.keys(EVENT_TYPE_META) as CalendarEventType[]).map((t) => (
          <span key={t} className="inline-flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${EVENT_TYPE_META[t].dot}`} />
            {EVENT_TYPE_META[t].label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <CakeIcon className="h-3.5 w-3.5 text-pink-500" /> Birthday
        </span>
      </div>

      {/* Grid */}
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="grid grid-cols-7 border-b bg-muted/40 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {WEEKDAY_LABELS.map((w) => (
            <div key={w} className="py-2">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {grid.map((g) => {
            const events = eventsByDate[g.date] ?? [];
            const birthdays = birthdaysByKey[monthDayKey(g.date)] ?? [];
            const attDot = attendanceDot(attendanceByDate[g.date] ?? "");
            const isToday = g.date === todayISO;
            return (
              <button
                type="button"
                key={g.date}
                onClick={() => setSelected(g.date)}
                className={`flex min-h-[76px] flex-col gap-1 border-b border-r p-1.5 text-left transition hover:bg-accent/50 ${
                  g.inMonth ? "" : "bg-muted/20 text-muted-foreground"
                }`}
              >
                <span className="flex items-center justify-between">
                  <span
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                      isToday ? "bg-primary text-primary-foreground" : ""
                    }`}
                  >
                    {g.day}
                  </span>
                  <span className="flex items-center gap-1">
                    {birthdays.length > 0 && <CakeIcon className="h-3.5 w-3.5 text-pink-500" />}
                    {attDot && <span className={`h-2 w-2 rounded-full ${attDot}`} />}
                  </span>
                </span>
                <span className="flex flex-col gap-0.5">
                  {events.slice(0, 3).map((e) => (
                    <span
                      key={e.id}
                      className="flex items-center gap-1 truncate text-[10px] leading-tight"
                    >
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${EVENT_TYPE_META[e.event_type].dot}`} />
                      <span className="truncate">{e.title}</span>
                    </span>
                  ))}
                  {events.length > 3 && (
                    <span className="text-[10px] text-muted-foreground">+{events.length - 3} more</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Day detail dialog */}
      {selected && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setSelected(null)}
            className="absolute inset-0 bg-black/40"
          />
          <div className="relative z-10 flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h2 className="text-sm font-semibold tracking-tight">{fmtLongDate(selected)}</h2>
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="Close"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
              {dayBirthdays.length > 0 && (
                <div className="flex items-start gap-2 rounded-xl border border-pink-200 bg-pink-50 px-3 py-2 text-sm dark:border-pink-900 dark:bg-pink-950/30">
                  <CakeIcon className="mt-0.5 h-4 w-4 shrink-0 text-pink-500" />
                  <span>
                    <span className="font-medium">Birthday{dayBirthdays.length > 1 ? "s" : ""}:</span>{" "}
                    {dayBirthdays.join(", ")}
                  </span>
                </div>
              )}

              {dayEvents.length === 0 && dayBirthdays.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No events on this day.
                </p>
              )}

              {dayEvents.map((e) => (
                <div key={e.id} className="rounded-xl border px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{e.title}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                        <span className={`rounded-full px-2 py-0.5 font-medium ${EVENT_TYPE_META[e.event_type].badge}`}>
                          {EVENT_TYPE_META[e.event_type].label}
                        </span>
                        {e.event_time && <span>{fmtTime(e.event_time)}</span>}
                        <span>· by {e.creatorName}</span>
                      </p>
                      {e.description && (
                        <p className="mt-1 whitespace-pre-wrap text-sm text-foreground/80">{e.description}</p>
                      )}
                    </div>
                    {e.mine && (
                      <button
                        type="button"
                        onClick={() => void remove(e.id)}
                        aria-label="Delete event"
                        className="shrink-0 text-muted-foreground transition hover:text-red-600"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t px-5 py-3">
              {selected <= todayISO ? (
                <Link
                  href={`/calendar/${selected}`}
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary transition hover:underline"
                >
                  <ExternalLinkIcon className="h-4 w-4" />
                  Open day report
                </Link>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={() => {
                  setAddFor(selected);
                  setSelected(null);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-90"
              >
                <CalendarPlusIcon className="h-4 w-4" />
                Add event
              </button>
            </div>
          </div>
        </div>
      )}

      {addFor && (
        <EventDialog
          date={addFor}
          departments={departments}
          allowedTypes={allowedTypes}
          onClose={() => setAddFor(null)}
        />
      )}
    </div>
  );
}
