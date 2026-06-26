"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Role } from "@/lib/types";

export interface InviteState {
  error: string | null;
  success: string | null;
}

/**
 * Server Action: create a new employee account (admin only).
 *
 * Security: requireAdmin() re-verifies the caller's role on the server before
 * any privileged work — the UI hiding this page is not relied upon. The
 * service-role admin client is only constructed here, on the server.
 *
 * The new auth user is created with `full_name` and `role` in user_metadata;
 * the `on_auth_user_created` database trigger then creates the matching
 * profile row. A temporary password is set, which the admin shares with the
 * employee to sign in (and which they can change later).
 */
export async function inviteUser(
  _prevState: InviteState,
  formData: FormData,
): Promise<InviteState> {
  await requireAdmin();

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const role = String(formData.get("role") ?? "employee") as Role;
  const password = String(formData.get("password") ?? "");

  if (!email || !fullName || !password) {
    return { error: "Name, email, and a temporary password are required.", success: null };
  }
  if (password.length < 8) {
    return { error: "Temporary password must be at least 8 characters.", success: null };
  }
  if (role !== "admin" && role !== "employee") {
    return { error: "Invalid role.", success: null };
  }

  const admin = createAdminClient();

  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // internal tool: skip the confirmation email
    user_metadata: { full_name: fullName, role },
  });

  if (error) {
    const message = error.message?.includes("already")
      ? "A user with that email already exists."
      : error.message || "Could not create the user.";
    return { error: message, success: null };
  }

  revalidatePath("/users");
  return { error: null, success: `${fullName} was added as ${role}.` };
}
