import { Logo } from "@/components/logo";
import { ForgotPasswordForm } from "@/components/forgot-password-form";
import { createClient } from "@/lib/supabase/server";

/**
 * Forgot / change password — request a reset link by email. Public, and also
 * reachable while signed in (the "Change password" link), in which case we
 * pre-fill the current account's email.
 */
export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo className="h-11 w-11" />
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">
            Reset your password
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            We&apos;ll email you a link to set a new password.
          </p>
        </div>

        {error === "expired" && (
          <p
            role="alert"
            className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
          >
            That reset link has expired or was already used. Request a new one
            below.
          </p>
        )}

        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <ForgotPasswordForm defaultEmail={user?.email ?? undefined} />
        </div>
      </div>
    </main>
  );
}
