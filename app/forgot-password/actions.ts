"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export interface ResetRequestState {
  error: string | null;
  success: string | null;
}

/**
 * Server Action: email the signed-in (or named) account a password-reset link.
 *
 * Supabase sends a recovery email whose link lands on `/auth/confirm`, which
 * verifies it and forwards to `/reset-password`. To avoid leaking which emails
 * have accounts, we report success regardless of whether the address exists —
 * Supabase itself does not reveal that either.
 */
export async function requestPasswordReset(
  _prev: ResetRequestState,
  formData: FormData,
): Promise<ResetRequestState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!email) {
    return { error: "Enter your account email.", success: null };
  }

  // Tell Supabase where the recovery link should return the user. The default
  // recovery email respects this, so no email-template editing is needed — the
  // link lands on our `/auth/confirm` handler (which establishes the session and
  // forwards to `/reset-password`). The origin is derived from the request so it
  // works on both localhost and the deployed domain. This URL must be added to
  // Supabase → Auth → URL Configuration → Redirect URLs.
  const hdrs = await headers();
  const host = hdrs.get("host");
  const proto = hdrs.get("x-forwarded-proto") ?? "https";
  const origin = hdrs.get("origin") ?? (host ? `${proto}://${host}` : "");
  const redirectTo = origin
    ? `${origin}/auth/confirm?next=/reset-password`
    : undefined;

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(
    email,
    redirectTo ? { redirectTo } : undefined,
  );

  if (error) {
    // Don't surface provider/rate-limit specifics to the form beyond a hint.
    return {
      error: "Could not send the email right now. Please try again shortly.",
      success: null,
    };
  }

  return {
    error: null,
    success:
      "If an account exists for that email, a link to set a new password is on its way. Check your inbox.",
  };
}
