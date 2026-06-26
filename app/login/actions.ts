"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface LoginState {
  error: string | null;
}

/**
 * Server Action: sign in with email + password via Supabase Auth.
 *
 * On success the session cookie is set and the user is redirected to the
 * dashboard. On failure a friendly error message is returned to the form.
 * There is intentionally no sign-up action — accounts are created by admins.
 */
export async function login(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Please enter both your email and password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Incorrect email or password. Please try again." };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
