"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CloseIcon } from "@/components/icons";
import {
  EVENT_TYPE_META,
  typeNeedsDepartments,
} from "@/lib/calendar";
import { createCalendarEvent } from "@/app/(dashboard)/calendar/actions";
import type { CalendarEventType } from "@/lib/types";

const inputClass =
  "w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring";
const labelClass = "text-xs font-medium text-muted-foreground";

const TYPE_HINT: Record<CalendarEventType, string> = {
  personal: "Only you can see this.",
  department: "Visible to everyone in the selected department(s).",
  common: "Visible to the whole company.",
  targeted: "Visible only to the selected department(s).",
};

/**
 * Create a calendar event. The type options are limited to what the creator's
 * role allows (RLS enforces the same server-side); department and targeted
 * events reveal a department multi-select.
 */
export function EventDialog({
  date,
  departments,
  allowedTypes,
  onClose,
}: {
  date: string;
  departments: { id: string; name: string }[];
  allowedTypes: CalendarEventType[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<CalendarEventType>(allowedTypes[0] ?? "personal");
  const [when, setWhen] = useState(date);
  const [time, setTime] = useState("");
  const [deptIds, setDeptIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsDepts = typeNeedsDepartments(type);

  function toggleDept(id: string) {
    setDeptIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await createCalendarEvent({
      title,
      description,
      type,
      date: when,
      time: time || null,
      departmentIds: needsDepts ? [...deptIds] : undefined,
    });
    setBusy(false);
    if (res.ok) {
      router.refresh();
      onClose();
    } else {
      setError(res.error ?? "Could not create the event.");
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <div className="relative z-10 flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-base font-semibold tracking-tight">Add event</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="space-y-1.5">
            <label className={labelClass} htmlFor="ev-title">Title</label>
            <input
              id="ev-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Team meeting, renew licence…"
              className={inputClass}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className={labelClass} htmlFor="ev-date">Date</label>
              <input
                id="ev-date"
                type="date"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <label className={labelClass} htmlFor="ev-time">Time <span className="font-normal">(optional)</span></label>
              <input
                id="ev-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          {allowedTypes.length > 1 && (
            <div className="space-y-1.5">
              <label className={labelClass} htmlFor="ev-type">Visibility</label>
              <select
                id="ev-type"
                value={type}
                onChange={(e) => setType(e.target.value as CalendarEventType)}
                className={inputClass}
              >
                {allowedTypes.map((t) => (
                  <option key={t} value={t}>
                    {EVENT_TYPE_META[t].label}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground">{TYPE_HINT[type]}</p>
            </div>
          )}

          {needsDepts && (
            <div className="space-y-1.5">
              <label className={labelClass}>Departments</label>
              <div className="flex flex-wrap gap-1.5">
                {departments.map((d) => {
                  const on = deptIds.has(d.id);
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => toggleDept(d.id)}
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                        on
                          ? "border-primary bg-primary text-primary-foreground"
                          : "hover:bg-accent"
                      }`}
                    >
                      {d.name}
                    </button>
                  );
                })}
                {departments.length === 0 && (
                  <p className="text-xs text-muted-foreground">No departments available.</p>
                )}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className={labelClass} htmlFor="ev-desc">Description <span className="font-normal">(optional)</span></label>
            <textarea
              id="ev-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className={`${inputClass} resize-y`}
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border px-3 py-2 text-sm font-medium transition hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || !title.trim()}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Adding…" : "Add event"}
          </button>
        </div>
      </div>
    </div>
  );
}
