import { redirect } from "next/navigation";
import { getUserAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/sidebar";
import { NotificationsProvider } from "@/components/notifications/notifications-provider";
import { NotificationToaster } from "@/components/notifications/notification-toaster";
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
  const access = await getUserAccess();
  if (!access) redirect("/login");

  const supabase = await createClient();
  const { data: notifications } = await supabase
    .from("notifications")
    .select("*")
    .eq("recipient_id", access.profile.id)
    .order("created_at", { ascending: false })
    .limit(30);

  return (
    <NotificationsProvider
      userId={access.profile.id}
      initial={(notifications ?? []) as Notification[]}
    >
      <div className="min-h-screen bg-background">
        <Sidebar profile={access.profile} canManageUsers={access.canManageUsers} />
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
