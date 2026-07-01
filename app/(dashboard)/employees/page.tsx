import { requireUserManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { InviteUserForm } from "@/components/invite-user-form";
import { EmployeeList, type EmployeeRow } from "@/components/employee-list";
import type { Department, Profile } from "@/lib/types";

/**
 * Employee Management — admins and HR & Management. requireUserManager()
 * redirects anyone else, and Row Level Security independently guarantees that
 * only those users can read the roster and change departments. Adding,
 * assigning departments, and removing (deactivating) employees all run through
 * guarded Server Actions.
 */
export default async function EmployeesPage() {
  const access = await requireUserManager();
  const supabase = await createClient();

  const [usersRes, deptRes, membRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, email, full_name, role, deactivated_at")
      .order("created_at", { ascending: true }),
    supabase.from("departments").select("*").order("name", { ascending: true }),
    supabase.from("profile_departments").select("profile_id, department_id"),
  ]);

  const users = (usersRes.data as Profile[]) ?? [];
  const departments = (deptRes.data as Department[]) ?? [];
  const memberships =
    (membRes.data as { profile_id: string; department_id: string }[]) ?? [];

  // Group department ids per employee.
  const deptIdsByUser = new Map<string, string[]>();
  for (const m of memberships) {
    const list = deptIdsByUser.get(m.profile_id) ?? [];
    list.push(m.department_id);
    deptIdsByUser.set(m.profile_id, list);
  }

  const employees: EmployeeRow[] = users.map((u) => ({
    id: u.id,
    fullName: u.full_name,
    email: u.email,
    role: u.role,
    departmentIds: deptIdsByUser.get(u.id) ?? [],
    deactivated: Boolean(u.deactivated_at),
  }));

  const activeCount = employees.filter((e) => !e.deactivated).length;

  return (
    <>
      <PageHeader
        title="Employee Management"
        description={`Add employees, assign departments, and manage access. ${activeCount} active.`}
      />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_1.1fr]">
        <InviteUserForm departments={departments} />
        <EmployeeList
          employees={employees}
          departments={departments}
          currentUserId={access.profile.id}
          isAdmin={access.isAdmin}
        />
      </div>
    </>
  );
}
