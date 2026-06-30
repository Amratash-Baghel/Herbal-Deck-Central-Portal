import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Recovery-link handler. Supabase's password-reset email points here; this route
 * exchanges the one-time link for a session and forwards to the page named in
 * `next` (the new-password form). It accepts either shape Supabase may send:
 *   - `token_hash` + `type` — the recommended SSR flow (verifyOtp), and
 *   - `code` — the PKCE redirect flow (exchangeCodeForSession),
 * so it keeps working regardless of which email template the project uses.
 *
 * On success the session cookie is set and we redirect to `next`; on a bad or
 * expired link we send the user back to request a fresh one.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/reset-password";

  const supabase = await createClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) redirect(next);
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) redirect(next);
  }

  redirect("/forgot-password?error=expired");
}
