import { redirect } from "next/navigation";
import { getUserAccess } from "@/lib/auth";
import { Sidebar } from "@/components/sidebar";

/**
 * Layout for the authenticated portal. Every route in this group renders
 * inside the sidebar shell and is protected: getUserAccess() returns null when
 * there is no signed-in user, in which case we redirect to /login.
 *
 * The user's capabilities (e.g. whether they can manage staff) are resolved
 * here and passed to the sidebar so the navigation reflects their authority.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const access = await getUserAccess();
  if (!access) redirect("/login");

  return (
    <div className="min-h-screen bg-background">
      <Sidebar profile={access.profile} canManageUsers={access.canManageUsers} />
      <div className="md:pl-64">
        <main className="mx-auto w-full max-w-6xl px-5 py-8 md:px-10 md:py-12">
          {children}
        </main>
      </div>
    </div>
  );
}
