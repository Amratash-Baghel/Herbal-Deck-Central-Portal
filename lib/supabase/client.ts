import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for use in Client Components (code that runs in the browser).
 *
 * Uses only the public URL and anon key. All data access is still enforced by
 * Row Level Security on the database, so this client can never read data the
 * signed-in user is not allowed to see.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
