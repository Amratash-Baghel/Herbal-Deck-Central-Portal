"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface UpdatePasswordState {
  error: string | null;
}

const MIN_LENGTH = 8;

/**
 * Server Action: set a new password for the current session. Reached after the
 * recovery link has established a (temporary) session via `/auth/confirm`.
 * Supabase ties the change to that session, so no old password is required.
 */
export async function updatePassword(
  _prev: UpdatePasswordState,
  formData: FormData,
): Promise<UpdatePasswordState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < MIN_LENGTH) {
    return { error: `Use at least ${MIN_LENGTH} characters.` };
  }
  if (password !== confirm) {
    return { error: "The two passwords don't match." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Your reset link has expired. Please request a new one." };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return {
      error:
        error.message ||
        "Could not update your password. The link may have expired — request a new one.",
    };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
