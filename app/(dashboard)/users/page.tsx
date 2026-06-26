import { requireUserManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { InviteUserForm } from "@/components/invite-user-form";
import { EditUserDepartments } from "@/components/edit-user-departments";
import type { Department, Profile } from "@/lib/types";

/**
 * User Management — admins and HR & Management. requireUserManager() redirects
 * anyone else, and Row Level Security independently guarantees that only those
 * users can read the full list of profiles and assign departments.
 */
export default async function UsersPage() {
  await requireUserManager();

  const supabase = await createClient();

  const [usersRes, deptRes, membRes] = await Promise.all([
    supabase.from("profiles").select("*").order("created_at", { ascending: true }),
    supabase.from("departments").select("*").order("name", { ascending: true }),
    supabase.from("profile_departments").select("profile_id, department_id"),
  ]);

  const users = (usersRes.data as Profile[]) ?? [];
  const departments = (deptRes.data as Department[]) ?? [];
  const memberships =
    (membRes.data as { profile_id: string; department_id: string }[]) ?? [];

  // Map each user to the departments they belong to.
  const deptById = new Map(departments.map((d) => [d.id, d]));
  const userDepartments = new Map<string, Department[]>();
  for (const m of memberships) {
    const dept = deptById.get(m.department_id);
    if (!dept) continue;
    const list = userDepartments.get(m.profile_id) ?? [];
    list.push(dept);
    userDepartments.set(m.profile_id, list);
  }

  return (
    <>
      <PageHeader
        title="User Management"
        description="Add employees, assign departments, and review who has access."
      />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_1.1fr]">
        <InviteUserForm departments={departments} />

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
            {users.map((u) => {
              const depts = userDepartments.get(u.id) ?? [];
              return (
                <li key={u.id} className="px-6 py-4">
                  <div className="flex items-center gap-3">
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
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {depts.length > 0 ? (
                      depts.map((d) => (
                        <span
                          key={d.id}
                          className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-primary"
                        >
                          {d.name}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        No department
                      </span>
                    )}
                  </div>

                  <div className="mt-2">
                    <EditUserDepartments
                      userId={u.id}
                      departments={departments}
                      selectedIds={depts.map((d) => d.id)}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </>
  );
}
