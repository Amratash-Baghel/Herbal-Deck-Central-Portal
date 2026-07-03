import { getUserAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import {
  EmployeeReviewList,
  type ReviewListRow,
} from "@/components/reporting/employee-review-list";

type ProfileRow = { id: string; full_name: string | null; email: string };

/**
 * Employee Reviews index — a searchable roster; pick anyone to drill into their
 * activity, task history, EOD reports, and stats. Admins + HR see everyone;
 * team leads see only their own department(s).
 */
export default async function EmployeeReviewsPage() {
  const access = await getUserAccess();
  const scopeDeptIds =
    access && !access.canManageUsers ? new Set(access.departmentIds) : null;
  const supabase = await createClient();

  const [{ data: profs }, { data: depts }, { data: membs }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email")
      .is("deactivated_at", null)
      .order("full_name", { nullsFirst: false }),
    supabase.from("departments").select("id, name"),
    supabase.from("profile_departments").select("profile_id, department_id"),
  ]);

  const deptNameById = new Map(
    ((depts ?? []) as { id: string; name: string }[]).map((d) => [d.id, d.name]),
  );
  const deptsByPerson = new Map<string, string[]>();
  const deptIdsByPerson = new Map<string, string[]>();
  for (const m of (membs ?? []) as { profile_id: string; department_id: string }[]) {
    const list = deptsByPerson.get(m.profile_id) ?? [];
    const name = deptNameById.get(m.department_id);
    if (name) list.push(name);
    deptsByPerson.set(m.profile_id, list);
    const ids = deptIdsByPerson.get(m.profile_id) ?? [];
    ids.push(m.department_id);
    deptIdsByPerson.set(m.profile_id, ids);
  }

  let people = (profs ?? []) as ProfileRow[];
  if (scopeDeptIds) {
    people = people.filter((p) =>
      (deptIdsByPerson.get(p.id) ?? []).some((id) => scopeDeptIds.has(id)),
    );
  }

  const rows: ReviewListRow[] = people.map((p) => ({
    id: p.id,
    name: p.full_name || p.email,
    email: p.email,
    departmentNames: deptsByPerson.get(p.id) ?? [],
  }));

  return (
    <>
      <PageHeader
        title="Employee Reviews"
        description="A complete picture of any one employee — pick a person to open their review."
      />
      <EmployeeReviewList rows={rows} />
    </>
  );
}
