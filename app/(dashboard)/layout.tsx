import { requireProfile } from "@/lib/auth";
import { Sidebar } from "@/components/sidebar";

/**
 * Layout for the authenticated portal. Every route in this group renders
 * inside the sidebar shell and is protected: requireProfile() redirects to
 * /login when there is no signed-in user.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();

  return (
    <div className="min-h-screen bg-background">
      <Sidebar profile={profile} />
      <div className="md:pl-64">
        <main className="mx-auto w-full max-w-6xl px-5 py-8 md:px-10 md:py-12">
          {children}
        </main>
      </div>
    </div>
  );
}
