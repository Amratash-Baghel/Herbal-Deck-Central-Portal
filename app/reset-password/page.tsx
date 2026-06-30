import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { ResetPasswordForm } from "@/components/reset-password-form";
import { createClient } from "@/lib/supabase/server";

/**
 * Set-a-new-password screen. Only reachable with the session the recovery link
 * established (via `/auth/confirm`); without it, we send the user back to
 * request a fresh link rather than show a form they couldn't submit.
 */
export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/forgot-password?error=expired");

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo className="h-11 w-11" />
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">
            Choose a new password
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter and confirm your new password below.
          </p>
        </div>

        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <ResetPasswordForm />
        </div>
      </div>
    </main>
  );
}
