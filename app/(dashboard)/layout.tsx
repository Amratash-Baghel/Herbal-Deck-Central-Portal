import { redirect } from "next/navigation";
import { after } from "next/server";
import { headers } from "next/headers";
import { getUserAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/sidebar";
import { NotificationsProvider } from "@/components/notifications/notifications-provider";
import { NotificationToaster } from "@/components/notifications/notification-toaster";
import { DashboardMain } from "@/components/dashboard-main";
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
  // Note: a layout is not re-rendered on client-side navigation, so this runs
  // on full page loads only — clicks between tabs are not recorded.
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
        {/* A flex column so a page can opt into filling the viewport (chat does
            this with flex-1) instead of guessing the chrome's height. The width
            cap scales with the display: comfortable for reading on a laptop,
            but not leaving half an external monitor empty. */}
        <div className="flex min-h-screen flex-col md:pl-64">
          <DashboardMain className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-5 py-8 md:px-10 md:py-12 tall:max-w-4xl wide:max-w-[min(94vw,calc(100vh*1.7))] ultrawide:max-w-[min(92vw,calc(100vh*2))]">
            {children}
          </DashboardMain>
        </div>
        <NotificationToaster />
      </div>
    </NotificationsProvider>
  );
}
