"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface LoginState {
  error: string | null;
  ok?: boolean;
}

/**
 * Server Action: sign in with email + password via Supabase Auth.
 *
 * On success the session cookie is set and `{ ok: true }` is returned; the
 * login page plays its success animation and then moves to the dashboard.
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
  return { error: null, ok: true };
}
