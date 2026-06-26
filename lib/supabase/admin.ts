import { createClient } from "@supabase/supabase-js";

/**
 * Privileged Supabase client using the service-role key.
 *
 * WARNING: This client BYPASSES Row Level Security. It must only ever be
 * constructed and used in trusted server-side code (Server Actions / Route
 * Handlers) and only after the caller has been verified as an admin. The
 * service-role key must never be sent to the browser.
 *
 * Used for operations the anon key cannot perform, such as creating new
 * employee accounts during the invite flow.
 */
export function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Admin features require it.",
    );
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
