"use server";

import { revalidatePath } from "next/cache";
import { requireUserManager } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { NOTE_COLOR_KEYS } from "@/lib/tasks";
import type { Role } from "@/lib/types";

export interface MutationState {
  error: string | null;
  success: string | null;
}

/** Backwards-compatible alias used by the invite form. */
export type InviteState = MutationState;

/**
 * Server Action: create a new employee account (admins or HR & Management).
 *
 * Security: requireUserManager() re-verifies the caller's authority on the
 * server before any privileged work — the UI hiding this page is not relied
 * upon. The service-role admin client is only constructed here, on the server.
 *
 * The new auth user is created with `full_name` and `role` in user_metadata;
 * the database trigger then creates the matching profile row. Any selected
 * departments are recorded in profile_departments.
 */
export async function inviteUser(
  _prevState: MutationState,
  formData: FormData,
): Promise<MutationState> {
  await requireUserManager();

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const post = String(formData.get("post") ?? "").trim();
  const role = String(formData.get("role") ?? "employee") as Role;
  const password = String(formData.get("password") ?? "");
  const departmentIds = formData
    .getAll("department_ids")
    .map(String)
    .filter(Boolean);

  if (!email || !fullName || !password) {
    return { error: "Name, email, and a temporary password are required.", success: null };
  }
  if (password.length < 8) {
    return { error: "Temporary password must be at least 8 characters.", success: null };
  }
  if (!["admin", "employee", "team_lead", "hr_management"].includes(role)) {
    return { error: "Invalid role.", success: null };
  }

  const admin = createAdminClient();

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // internal tool: skip the confirmation email
    user_metadata: { full_name: fullName, role, post: post || null },
  });

  if (error) {
    const message = error.message?.includes("already")
      ? "A user with that email already exists."
      : error.message || "Could not create the user.";
    return { error: message, success: null };
  }

  const newUserId = created.user?.id;
  if (newUserId && departmentIds.length > 0) {
    const rows = departmentIds.map((department_id) => ({
      profile_id: newUserId,
      department_id,
    }));
    const { error: deptError } = await admin
      .from("profile_departments")
      .insert(rows);
    if (deptError) {
      return {
        error: `Account created, but assigning departments failed: ${deptError.message}`,
        success: null,
      };
    }
  }

  // Assign a default sticky-note colour, unique within the new employee's
  // primary department (fall back to cycling the palette if all are taken) — so
  // their notes are visually distinguishable from their teammates' at a glance.
  if (newUserId) {
    let noteColor = NOTE_COLOR_KEYS[0];
    const primaryDept = departmentIds[0];
    if (primaryDept) {
      const { data: peerRows } = await admin
        .from("profile_departments")
        .select("profile_id")
        .eq("department_id", primaryDept);
      const peerIds = (peerRows ?? [])
        .map((r) => r.profile_id as string)
        .filter((id) => id !== newUserId);
      let used = new Set<string>();
      if (peerIds.length > 0) {
        const { data: colorRows } = await admin
          .from("profiles")
          .select("note_color")
          .in("id", peerIds);
        used = new Set(
          (colorRows ?? [])
            .map((r) => r.note_color as string | null)
            .filter((c): c is string => Boolean(c)),
        );
      }
      noteColor =
        NOTE_COLOR_KEYS.find((c) => !used.has(c)) ??
        NOTE_COLOR_KEYS[peerIds.length % NOTE_COLOR_KEYS.length];
    }
    await admin.from("profiles").update({ note_color: noteColor }).eq("id", newUserId);
  }

  revalidatePath("/employees");
  return { error: null, success: `${fullName} was added as ${role}.` };
}

/**
 * Server Action: replace a user's department memberships (admins or HR &
 * Management). Deletes existing memberships and inserts the new selection.
 */
export async function setUserDepartments(
  _prevState: MutationState,
  formData: FormData,
): Promise<MutationState> {
  await requireUserManager();

  const userId = String(formData.get("user_id") ?? "");
  const departmentIds = formData
    .getAll("department_ids")
    .map(String)
    .filter(Boolean);

  if (!userId) {
    return { error: "Missing user.", success: null };
  }

  const admin = createAdminClient();

  const { error: delError } = await admin
    .from("profile_departments")
    .delete()
    .eq("profile_id", userId);
  if (delError) {
    return { error: delError.message, success: null };
  }

  if (departmentIds.length > 0) {
    const rows = departmentIds.map((department_id) => ({
      profile_id: userId,
      department_id,
    }));
    const { error: insError } = await admin
      .from("profile_departments")
      .insert(rows);
    if (insError) {
      return { error: insError.message, success: null };
    }
  }

  revalidatePath("/employees");
  return { error: null, success: "Departments updated." };
}

/**
 * Server Action: change an existing employee's role (admins only). Used to
 * promote someone to team_lead (or admin), or back to employee. You can't
 * change your own role. Team-lead authority is department-scoped, so it takes
 * effect against whatever departments the person already belongs to.
 */
export async function setUserRole(formData: FormData): Promise<void> {
  const access = await requireUserManager();
  if (!access.isAdmin) return; // only owner-level admins assign roles
  const userId = String(formData.get("user_id") ?? "");
  const role = String(formData.get("role") ?? "") as Role;
  if (!userId || userId === access.profile.id) return;
  if (!["admin", "employee", "team_lead", "hr_management"].includes(role)) return;

  const admin = createAdminClient();
  await admin.from("profiles").update({ role }).eq("id", userId);
  revalidatePath("/employees");
}

/**
 * Server Action: deactivate ("remove") an employee. This is a soft remove —
 * the profile and all their history (e.g. invoices they raised) are kept, but
 * their access is revoked: the profile is flagged `deactivated_at` and their
 * auth login is banned so any live session is cut off.
 *
 * Guards: you cannot deactivate yourself, and only an admin can deactivate
 * another admin. Re-checked server-side regardless of the UI.
 */
export async function deactivateEmployee(formData: FormData): Promise<void> {
  const access = await requireUserManager();
  const userId = String(formData.get("user_id") ?? "");
  if (!userId || userId === access.profile.id) return;

  const admin = createAdminClient();

  const { data: target } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (!target) return;
  if ((target as { role: Role }).role === "admin" && !access.isAdmin) return;

  await admin
    .from("profiles")
    .update({ deactivated_at: new Date().toISOString() })
    .eq("id", userId);

  // Cut off any live session. Best-effort — the app guard already blocks access.
  try {
    await admin.auth.admin.updateUserById(userId, { ban_duration: "876000h" });
  } catch {
    // ignore: deactivation already took effect at the app layer
  }

  revalidatePath("/employees");
}

/** Server Action: restore a previously deactivated employee. */
export async function reactivateEmployee(formData: FormData): Promise<void> {
  await requireUserManager();
  const userId = String(formData.get("user_id") ?? "");
  if (!userId) return;

  const admin = createAdminClient();
  await admin.from("profiles").update({ deactivated_at: null }).eq("id", userId);
  try {
    await admin.auth.admin.updateUserById(userId, { ban_duration: "none" });
  } catch {
    // ignore: reactivation already took effect at the app layer
  }

  revalidatePath("/employees");
}
