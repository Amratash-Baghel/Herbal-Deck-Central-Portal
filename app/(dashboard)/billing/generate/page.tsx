import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { InvoiceGenerator } from "@/components/invoice-generator";

/**
 * Invoice generator — available to any signed-in employee. Fill in the details,
 * download a branded PDF, and (optionally) post it into expense tracking. We
 * load the employee's own departments and the category list so posting can
 * auto-attribute the invoice.
 */
export default async function GenerateInvoicePage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const [deptRes, catRes] = await Promise.all([
    supabase
      .from("profile_departments")
      .select("departments(id, name)")
      .eq("profile_id", profile.id),
    supabase.from("invoice_categories").select("id, name").order("name"),
  ]);

  // A foreign-key embed returns one related row at runtime but is typed as an
  // array — normalise both shapes into a flat {id,name}[].
  type Dept = { id: string; name: string };
  const departments: Dept[] = ((deptRes.data ?? []) as Array<{
    departments: Dept | Dept[] | null;
  }>)
    .map((row) => {
      const d = row.departments;
      if (!d) return null;
      return Array.isArray(d) ? (d[0] ?? null) : d;
    })
    .filter((d): d is Dept => Boolean(d));

  const categories = (catRes.data as Dept[]) ?? [];

  return (
    <>
      <PageHeader
        title="Create an Invoice"
        description="Fill in the details, download the branded PDF, then post it for signing and clearing."
      />
      <InvoiceGenerator
        employeeName={profile.full_name || profile.email}
        departments={departments}
        categories={categories}
      />
    </>
  );
}
