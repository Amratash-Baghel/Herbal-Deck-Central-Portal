"use server";

import { getUserAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { CalendarEvent, CalendarEventType } from "@/lib/types";

/**
 * Server actions for the Calendar. Creation rights and visibility are enforced
 * by RLS (migration 0023); these actions authenticate the caller, derive the
 * visibility fields from the chosen type, and let the database have the final say.
 */

export interface EventResult {
  ok: boolean;
  error?: string;
  event?: CalendarEvent;
}

const TYPES = new Set<CalendarEventType>(["personal", "department", "common", "targeted"]);

export async function createCalendarEvent(input: {
  title: string;
  description?: string;
  type: CalendarEventType;
  date: string;
  time?: string | null;
  departmentIds?: string[];
}): Promise<EventResult> {
  const access = await getUserAccess();
  if (!access) return { ok: false, error: "You are not signed in." };

  const title = (input.title ?? "").trim();
  if (!title) return { ok: false, error: "Enter a title." };
  if (title.length > 200) return { ok: false, error: "That title is too long." };
  if (!TYPES.has(input.type)) return { ok: false, error: "Invalid event type." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { ok: false, error: "Pick a valid date." };

  const time = input.time && /^\d{2}:\d{2}$/.test(input.time) ? input.time : null;
  const description = (input.description ?? "").trim().slice(0, 2000) || null;

  let departmentIds: string[] | null = null;
  let visibleToAll = false;
  if (input.type === "common") {
    visibleToAll = true;
  } else if (input.type === "department" || input.type === "targeted") {
    departmentIds = [...new Set(input.departmentIds ?? [])].filter(Boolean);
    if (departmentIds.length === 0) {
      return { ok: false, error: "Choose at least one department." };
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("calendar_events")
    .insert({
      title,
      description,
      event_type: input.type,
      event_date: input.date,
      event_time: time,
      created_by: access.profile.id,
      department_ids: departmentIds,
      visible_to_all: visibleToAll,
    })
    .select("*")
    .single();

  if (error || !data) {
    // RLS rejects a type the caller isn't allowed to create.
    return {
      ok: false,
      error: error?.message ?? "You can't create that kind of event.",
    };
  }
  return { ok: true, event: data as CalendarEvent };
}

export async function deleteCalendarEvent(id: string): Promise<{ ok: boolean; error?: string }> {
  const access = await getUserAccess();
  if (!access) return { ok: false, error: "You are not signed in." };
  const supabase = await createClient();
  const { error } = await supabase.from("calendar_events").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
