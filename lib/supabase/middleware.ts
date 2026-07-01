import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase auth session on every request and enforces coarse
 * route protection:
 *   - Unauthenticated users are redirected to /login (except on public routes).
 *   - Authenticated users visiting /login are sent to the dashboard.
 *
 * This runs in the Edge middleware. Fine-grained, per-row data access is still
 * enforced by Row Level Security in the database.
 */
export async function updateSession(request: NextRequest) {
  // Expose the current path to Server Components (for passive activity logging).
  // Setting it on the forwarded request headers is the supported way to read a
  // pathname from a layout, which otherwise doesn't receive it.
  request.headers.set("x-pathname", request.nextUrl.pathname);

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: do not run code between createServerClient and getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  // Public routes: the login screen, the "forgot password" request page, and
  // everything under /auth (the recovery-link confirm handler + sign-out).
  // Note: /reset-password is intentionally NOT public — you reach it only with
  // the temporary session the recovery link establishes.
  const isPublicRoute =
    pathname === "/login" ||
    pathname === "/forgot-password" ||
    pathname.startsWith("/auth");

  // Not signed in and trying to reach a protected route → go to login.
  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Already signed in but on the login page → go to the dashboard.
  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
