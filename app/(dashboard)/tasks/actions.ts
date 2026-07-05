"use server";

import { revalidatePath } from "next/cache";
import { getUserAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { notifyUsers } from "@/lib/notifications";
import { localDateISO } from "@/lib/time";
import { sanitizeRichText } from "@/lib/rich-text";
import { NOTE_COLORS } from "@/lib/tasks";
import type { Task, TaskStatus } from "@/lib/types";

const NOTE_COLOR_KEYS = new Set(NOTE_COLORS.map((c) => c.key));
/** Validate a note-colour key (or null) so only known colours are stored. */
function cleanColor(color: string | null | undefined): string | null {
  return color && NOTE_COLOR_KEYS.has(color) ? color : null;
}

/**
 * Server Actions for Tasks & Reporting.
 *
 * Everything runs through the RLS-scoped anon client, so the database is the
 * authority on who may create, see, move, and edit a task (own / assigned /
 * department / manager). The only elevation is raising an assignment
 * notification for another person, which goes through the service-role-backed
 * notifications helper. Activity logging and completed_at are handled by
 * database triggers, so the log can't drift from reality.
 */

export interface TaskResult {
  ok: boolean;
  error?: string;
  task?: Task;
}

function displayName(p: { full_name: string | null; email: string }): string {
  return p.full_name || p.email;
}

/**
 * May `access` assign a task to `target`? Self / unassigned is always allowed;
 * admins + HR can assign to anyone; team leads only to people who share one of
 * their departments. Mirrors the `can_assign_to()` SQL used by RLS.
 */
async function canAssignTo(
  access: Awaited<ReturnType<typeof getUserAccess>>,
  supabase: Awaited<ReturnType<typeof createClient>>,
  target: string | null | undefined,
): Promise<boolean> {
  if (!access) return false;
  if (!target || target === access.profile.id) return true;
  if (access.canManageUsers) return true;
  if (access.isTeamLead && access.departmentIds.length > 0) {
    const { data } = await supabase
      .from("profile_departments")
      .select("profile_id")
      .eq("profile_id", target)
      .in("department_id", access.departmentIds)
      .limit(1)
      .maybeSingle();
    return Boolean(data);
  }
  return false;
}

/** Notify an assignee (when it's someone other than the actor). */
async function notifyAssignee(
  assigneeId: string | null | undefined,
  actor: { id: string; full_name: string | null; email: string },
  taskId: string,
  title: string,
) {
  if (!assigneeId || assigneeId === actor.id) return;
  await notifyUsers([
    {
      recipientId: assigneeId,
      type: "task_assigned",
      title: `${displayName(actor)} assigned you a task`,
      body: title,
      link: "/tasks",
      data: { taskId },
    },
  ]);
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  departmentId?: string;
  assignedTo?: string | null;
  deadline?: string | null;
  color?: string | null;
}

/**
 * Create a task. Defaults to the creator's first department and self-assignment
 * for the one-tap sticky-note flow; a fuller create can pass the other fields.
 */
export async function createTask(input: CreateTaskInput): Promise<TaskResult> {
  const access = await getUserAccess();
  if (!access) return { ok: false, error: "You are not signed in." };

  const title = (input.title ?? "").trim();
  if (!title) return { ok: false, error: "Give the task a title." };
  if (title.length > 200) return { ok: false, error: "Title is too long." };

  const supabase = await createClient();

  // Resolve the department: an explicit (validated) one, else the user's first.
  let departmentId = input.departmentId;
  if (departmentId && !access.isAdmin) {
    const { data: membership } = await supabase
      .from("profile_departments")
      .select("department_id")
      .eq("profile_id", access.profile.id)
      .eq("department_id", departmentId)
      .maybeSingle();
    if (!membership) {
      return { ok: false, error: "Pick a department you belong to." };
    }
  }
  if (!departmentId) {
    const { data: firstDept } = await supabase
      .from("profile_departments")
      .select("department_id")
      .eq("profile_id", access.profile.id)
      .limit(1)
      .maybeSingle();
    departmentId = firstDept?.department_id as string | undefined;
  }
  if (!departmentId) {
    return {
      ok: false,
      error: "You're not in a department yet — ask an admin to add you.",
    };
  }

  const assignedTo =
    input.assignedTo === undefined ? access.profile.id : input.assignedTo;

  if (!(await canAssignTo(access, supabase, assignedTo))) {
    return {
      ok: false,
      error: access.isTeamLead
        ? "You can only assign tasks to people in your department."
        : "Only team leads and managers can assign tasks to others.",
    };
  }

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      title,
      description: sanitizeRichText(input.description) || null,
      department_id: departmentId,
      created_by: access.profile.id,
      assigned_to: assignedTo,
      deadline: input.deadline || null,
      color: cleanColor(input.color),
      status: "todo",
    })
    .select("*")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Could not create the task." };
  }

  await notifyAssignee(assignedTo, access.profile, data.id, title);
  revalidatePath("/tasks");
  return { ok: true, task: data as Task };
}

/**
 * Move a task to a new column (status). Only the assignee may push a task
 * forward — the creator can put one in someone's To Do but not move it on for
 * them. Admins + HR & Management may move anything; an unassigned task may be
 * moved by whoever has edit access (typically the creator).
 */
export async function moveTask(
  taskId: string,
  status: TaskStatus,
): Promise<TaskResult> {
  const access = await getUserAccess();
  if (!access) return { ok: false, error: "You are not signed in." };

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("tasks")
    .select("assigned_to")
    .eq("id", taskId)
    .single();
  if (!current) return { ok: false, error: "Task not found." };

  const canMove =
    access.canManageUsers ||
    current.assigned_to === null ||
    current.assigned_to === access.profile.id;
  if (!canMove) {
    return { ok: false, error: "Only the assignee can move this task." };
  }

  const { data, error } = await supabase
    .from("tasks")
    .update({ status })
    .eq("id", taskId)
    .select("*")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Could not move the task." };
  }
  revalidatePath("/tasks");
  return { ok: true, task: data as Task };
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  assignedTo?: string | null;
  departmentId?: string;
  deadline?: string | null;
  color?: string | null;
}

/** Edit a task's details (creator / assignee / manager, enforced by RLS). */
export async function updateTask(
  taskId: string,
  input: UpdateTaskInput,
): Promise<TaskResult> {
  const access = await getUserAccess();
  if (!access) return { ok: false, error: "You are not signed in." };

  const supabase = await createClient();

  // Load the current row so we can enforce the assignment rules.
  const { data: current } = await supabase
    .from("tasks")
    .select("assigned_to, status")
    .eq("id", taskId)
    .single();
  if (!current) return { ok: false, error: "Task not found." };

  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) {
    const t = input.title.trim();
    if (!t) return { ok: false, error: "Title can't be empty." };
    patch.title = t;
  }
  if (input.description !== undefined) {
    patch.description = sanitizeRichText(input.description) || null;
  }
  if (input.color !== undefined) {
    patch.color = cleanColor(input.color);
  }
  if (input.assignedTo !== undefined) {
    const changing =
      (current.assigned_to ?? null) !== (input.assignedTo ?? null);
    // A completed task's assignee is locked.
    if (changing && current.status === "done") {
      return { ok: false, error: "A completed task cannot be reassigned." };
    }
    // The new assignee must be someone the caller may assign to (self /
    // team-lead's department / manager anyone).
    if (changing && !(await canAssignTo(access, supabase, input.assignedTo))) {
      return {
        ok: false,
        error: access.isTeamLead
          ? "You can only assign tasks to people in your department."
          : "Only team leads and managers can assign tasks to others.",
      };
    }
    patch.assigned_to = input.assignedTo;
  }
  if (input.deadline !== undefined) patch.deadline = input.deadline || null;
  if (input.departmentId !== undefined) {
    if (!access.isAdmin) {
      const { data: membership } = await supabase
        .from("profile_departments")
        .select("department_id")
        .eq("profile_id", access.profile.id)
        .eq("department_id", input.departmentId)
        .maybeSingle();
      if (!membership) {
        return { ok: false, error: "Pick a department you belong to." };
      }
    }
    patch.department_id = input.departmentId;
  }

  if (Object.keys(patch).length === 0) return { ok: false, error: "Nothing to update." };

  const { data, error } = await supabase
    .from("tasks")
    .update(patch)
    .eq("id", taskId)
    .select("*")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Could not update the task." };
  }

  if (input.assignedTo !== undefined) {
    await notifyAssignee(input.assignedTo, access.profile, data.id, data.title);
  }
  revalidatePath("/tasks");
  return { ok: true, task: data as Task };
}

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/** Archive a task (hides it from the board; kept for reporting). */
export async function archiveTask(taskId: string): Promise<ActionResult> {
  const access = await getUserAccess();
  if (!access) return { ok: false, error: "You are not signed in." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("tasks")
    .update({ archived: true })
    .eq("id", taskId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/tasks");
  return { ok: true };
}

/** Delete a task — only its creator, never anyone else's (enforced by RLS too). */
export async function deleteTask(taskId: string): Promise<ActionResult> {
  const access = await getUserAccess();
  if (!access) return { ok: false, error: "You are not signed in." };
  const supabase = await createClient();

  const { data: current } = await supabase
    .from("tasks")
    .select("created_by")
    .eq("id", taskId)
    .single();
  if (!current) return { ok: false, error: "Task not found." };
  if (current.created_by !== access.profile.id) {
    return { ok: false, error: "You can only delete tasks you created." };
  }

  const { error } = await supabase.from("tasks").delete().eq("id", taskId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/tasks");
  return { ok: true };
}

/**
 * Save (finalise) today's EOD report: snapshot the activity counts and store the
 * optional note. Upserts the single row per employee per day.
 */
export async function saveEodNote(note: string): Promise<ActionResult> {
  const access = await getUserAccess();
  if (!access) return { ok: false, error: "You are not signed in." };

  const supabase = await createClient();
  const today = localDateISO();

  // Snapshot the counts from the activity log via the SECURITY DEFINER helper.
  const { data: summary } = await supabase.rpc("eod_summary", {
    emp: access.profile.id,
    d: today,
  });

  // The live "pending" tile counts all outstanding tasks, but a finalised EOD
  // report only records pending work that has a deadline — undated pending
  // tasks aren't a same-day concern and shouldn't clutter the historical record.
  const { count: pendingWithDeadline } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("assigned_to", access.profile.id)
    .neq("status", "done")
    .eq("archived", false)
    .not("deadline", "is", null);

  const snapshot = {
    ...((summary as Record<string, unknown>) ?? {}),
    pending: pendingWithDeadline ?? 0,
  };

  // Admins + HR are notified by a database trigger on eod_reports INSERT
  // (see migration 0014) — reliable regardless of the service-role env var.
  const { error } = await supabase.from("eod_reports").upsert(
    {
      employee_id: access.profile.id,
      report_date: today,
      auto_summary: snapshot,
      manual_note: note.trim() || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "employee_id,report_date" },
  );

  if (error) return { ok: false, error: error.message };

  revalidatePath("/tasks/reports");
  revalidatePath("/reporting");
  return { ok: true };
}
