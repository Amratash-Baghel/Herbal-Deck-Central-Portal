import { redirect } from "next/navigation";
import { after } from "next/server";
import { headers } from "next/headers";
import { getUserAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/sidebar";
import { NotificationsProvider } from "@/components/notifications/notifications-provider";
import { NotificationToaster } from "@/components/notifications/notification-toaster";
import { time } from "@/lib/perf";
import type { Notification } from "@/lib/types";

/**
 * Layout for the authenticated portal. Every route in this group renders
 * inside the sidebar shell and is protected: getUserAccess() returns null when
 * there is no signed-in user, in which case we redirect to /login.
 *
 * The user's capabilities (e.g. whether they can manage staff) are resolved
 * here and passed to the sidebar so the navigation reflects their authority.
 * The whole shell is wrapped in NotificationsProvider, which seeds the bell
 * from the most recent notifications and keeps it live via Supabase Realtime.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const access = await time("layout:getUserAccess", () => getUserAccess());
  if (!access) redirect("/login");

  const supabase = await createClient();
  const { data: notifications } = await time("layout:notifications", () =>
    supabase
      .from("notifications")
      .select("id, type, title, body, link, data, read_at, created_at")
      .eq("recipient_id", access.profile.id)
      .order("created_at", { ascending: false })
      .limit(30),
  );

  // Passive activity ("attendance") logging. Runs AFTER the response is sent
  // via after(), so it adds no latency to the page. record_activity() keys off
  // the session (auth.uid()), so a user can only ever stamp their own row.
  const pathname = (await headers()).get("x-pathname") ?? "";
  after(async () => {
    try {
      await supabase.rpc("record_activity", { page: pathname });
    } catch {
      // Best-effort — attendance logging must never affect the request.
    }
  });

  return (
    <NotificationsProvider
      userId={access.profile.id}
      initial={(notifications ?? []) as Notification[]}
    >
      <div className="min-h-screen bg-background">
        <Sidebar
          profile={access.profile}
          canManageUsers={access.canManageUsers}
          canViewReports={access.canViewReports}
        />
        <div className="md:pl-64">
          <main className="mx-auto w-full max-w-6xl px-5 py-8 md:px-10 md:py-12">
            {children}
          </main>
        </div>
        <NotificationToaster />
      </div>
    </NotificationsProvider>
  );
}
