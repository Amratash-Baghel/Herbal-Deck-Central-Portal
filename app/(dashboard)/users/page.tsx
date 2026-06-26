import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { InviteUserForm } from "@/components/invite-user-form";
import type { Profile } from "@/lib/types";

/**
 * User Management — admin only. requireAdmin() redirects non-admins, and Row
 * Level Security independently guarantees that only admins can read the full
 * list of profiles (an employee hitting this query would see only themselves).
 */
export default async function UsersPage() {
  await requireAdmin();

  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: true });

  const users = (data as Profile[]) ?? [];

  return (
    <>
      <PageHeader
        title="User Management"
        description="Add employees and review who has access to the portal."
      />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_1.1fr]">
        <InviteUserForm />

        <div className="rounded-2xl border bg-card shadow-sm">
          <div className="border-b px-6 py-4">
            <h2 className="text-base font-semibold tracking-tight">
              Team members
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {users.length} {users.length === 1 ? "account" : "accounts"}
            </p>
          </div>
          <ul className="divide-y">
            {users.map((u) => (
              <li key={u.id} className="flex items-center gap-3 px-6 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {u.full_name || "—"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {u.email}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${
                    u.role === "admin"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {u.role}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
