import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { EodList, type EodListPerson } from "@/components/reporting/eod-list";
import { time } from "@/lib/perf";
import type { DeptRef } from "@/components/tasks/types";
import type { EodReport } from "@/lib/types";

type ProfileRow = { id: string; full_name: string | null; email: string };

/**
 * EOD Reports — the full submitted-report history (admins + HR & Management),
 * filterable by employee, department, and date range. Each report opens to show
 * the manual note plus that day's task timeline with exact timestamps. A
 * ?employee=&date= link (e.g. from the Team Overview) pre-selects and opens
 * that specific report.
 */
export default async function EodReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ employee?: string; date?: string }>;
}) {
  const { employee, date } = await searchParams;
  const supabase = await createClient();

  const [{ data: reports }, { data: profs }, { data: membs }, { data: depts }] =
    await time("reporting/eod:queries", () =>
      Promise.all([
        supabase
          .from("eod_reports")
          .select("*")
          .order("report_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(300),
        supabase
          .from("profiles")
          .select("id, full_name, email")
          .is("deactivated_at", null)
          .order("full_name", { nullsFirst: false }),
        supabase.from("profile_departments").select("profile_id, department_id"),
        supabase.from("departments").select("id, name, slug").order("name"),
      ]),
    );

  const deptIdsByPerson = new Map<string, string[]>();
  for (const m of (membs ?? []) as { profile_id: string; department_id: string }[]) {
    const list = deptIdsByPerson.get(m.profile_id) ?? [];
    list.push(m.department_id);
    deptIdsByPerson.set(m.profile_id, list);
  }

  const people: EodListPerson[] = ((profs ?? []) as ProfileRow[]).map((p) => ({
    id: p.id,
    name: p.full_name || p.email,
    departmentIds: deptIdsByPerson.get(p.id) ?? [],
  }));

  return (
    <>
      <PageHeader
        title="EOD Reports"
        description="Every submitted end-of-day report — open one to see the full day's activity."
      />
      <EodList
        reports={(reports ?? []) as EodReport[]}
        people={people}
        departments={(depts ?? []) as DeptRef[]}
        initialEmployee={employee ?? ""}
        initialDate={date ?? ""}
      />
    </>
  );
}
