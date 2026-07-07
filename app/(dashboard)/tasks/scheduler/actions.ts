"use server";

import { revalidatePath } from "next/cache";
import { getUserAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { localDateISO } from "@/lib/time";
import type { ScheduleRecurrence, ScheduleTarget, TaskSchedule } from "@/lib/types";

/**
 * Server actions for the task scheduler. Who may schedule for whom is enforced
 * by RLS (migration 0024, `can_schedule_task`); these actions authenticate the
 * caller, shape the row, and let the database decide.
 */

export interface ScheduleResult {
  ok: boolean;
  error?: string;
  schedule?: TaskSchedule;
}

const TARGETS = new Set<ScheduleTarget>(["person", "department", "everyone"]);
const RECURRENCES = new Set<ScheduleRecurrence>(["daily", "weekly", "once", "range"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function createSchedule(input: {
  title: string;
  description?: string;
  departmentId: string;
  targetType: ScheduleTarget;
  targetPersonId?: string | null;
  targetDepartmentId?: string | null;
  recurrence: ScheduleRecurrence;
  weekdays?: number[];
  startDate: string;
  endDate?: string | null;
}): Promise<ScheduleResult> {
  const access = await getUserAccess();
  if (!access) return { ok: false, error: "You are not signed in." };

  const title = (input.title ?? "").trim();
  if (!title) return { ok: false, error: "Enter a title." };
  if (title.length > 200) return { ok: false, error: "That title is too long." };
  if (!input.departmentId) return { ok: false, error: "Pick a department." };
  if (!TARGETS.has(input.targetType)) return { ok: false, error: "Invalid target." };
  if (!RECURRENCES.has(input.recurrence)) return { ok: false, error: "Invalid recurrence." };
  if (!DATE_RE.test(input.startDate)) return { ok: false, error: "Pick a start date." };

  let targetPerson: string | null = null;
  let targetDepartment: string | null = null;
  if (input.targetType === "person") {
    targetPerson = input.targetPersonId || null;
    if (!targetPerson) return { ok: false, error: "Choose a person." };
  } else if (input.targetType === "department") {
    targetDepartment = input.targetDepartmentId || null;
    if (!targetDepartment) return { ok: false, error: "Choose a department." };
  }

  const weekdays =
    input.recurrence === "weekly"
      ? [...new Set(input.weekdays ?? [])].filter((d) => d >= 0 && d <= 6)
      : [];
  if (input.recurrence === "weekly" && weekdays.length === 0) {
    return { ok: false, error: "Pick at least one weekday." };
  }

  let endDate: string | null = null;
  if (input.recurrence === "range") {
    if (!input.endDate || !DATE_RE.test(input.endDate)) {
      return { ok: false, error: "Pick an end date for the range." };
    }
    if (input.endDate < input.startDate) {
      return { ok: false, error: "The end date can't be before the start date." };
    }
    endDate = input.endDate;
  } else if (input.endDate && DATE_RE.test(input.endDate)) {
    // Optional "until" for daily / weekly.
    endDate = input.endDate >= input.startDate ? input.endDate : null;
  }

  const description = (input.description ?? "").trim().slice(0, 2000) || null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("task_schedules")
    .insert({
      title,
      description,
      department_id: input.departmentId,
      created_by: access.profile.id,
      target_type: input.targetType,
      target_person: targetPerson,
      target_department: targetDepartment,
      recurrence: input.recurrence,
      weekdays,
      start_date: input.startDate,
      end_date: endDate,
    })
    .select("*")
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: error?.message ?? "You can't schedule tasks for that target.",
    };
  }

  // Materialise today's occurrence right away so a schedule that fires today
  // shows on boards immediately (idempotent).
  await supabase.rpc("materialize_scheduled_tasks", { d: localDateISO() }).then(
    () => {},
    () => {},
  );

  revalidatePath("/tasks/scheduler");
  revalidatePath("/tasks");
  return { ok: true, schedule: data as TaskSchedule };
}

export async function toggleSchedule(id: string, active: boolean): Promise<{ ok: boolean; error?: string }> {
  const access = await getUserAccess();
  if (!access) return { ok: false, error: "You are not signed in." };
  const supabase = await createClient();
  const { error } = await supabase.from("task_schedules").update({ active }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/tasks/scheduler");
  return { ok: true };
}

export async function deleteSchedule(id: string): Promise<{ ok: boolean; error?: string }> {
  const access = await getUserAccess();
  if (!access) return { ok: false, error: "You are not signed in." };
  const supabase = await createClient();
  const { error } = await supabase.from("task_schedules").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/tasks/scheduler");
  return { ok: true };
}
