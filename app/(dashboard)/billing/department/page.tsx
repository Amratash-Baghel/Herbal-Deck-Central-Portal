import { redirect } from "next/navigation";
import { getUserAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/page-header";
import { DeptInvoicesList, type DeptInvoiceRow } from "@/components/dept-invoices-list";
import { time } from "@/lib/perf";
import { INVOICE_LIST_COLUMNS, type Invoice } from "@/lib/types";

type ProfileRow = { id: string; full_name: string | null; email: string };

/**
 * Department invoices — read-only. Team leads see invoices posted by their
 * department(s); admins + HR can also open it (scoped to their department[s]).
 * Clearing/rejecting stays in the "Clear" tab (billing managers only).
 */
export default async function DepartmentInvoicesPage() {
  const access = await getUserAccess();
  if (!access) redirect("/login");
  if (!access.canViewDeptInvoices) redirect("/billing");

  const supabase = await createClient();
  const myDeptIds = access.departmentIds;

  if (myDeptIds.length === 0) {
    return (
      <>
        <PageHeader title="Department Invoices" description="Invoices posted by your department." />
        <p className="rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
          You&apos;re not in a department yet — ask an admin to add you.
        </p>
      </>
    );
  }

  const [{ data: invoiceRows }, { data: profs }] = await time(
    "billing/department:queries",
    () =>
      Promise.all([
        supabase
          .from("invoices")
          .select(INVOICE_LIST_COLUMNS)
          .in("department_id", myDeptIds)
          .order("created_at", { ascending: false }),
        supabase.from("profiles").select("id, full_name, email"),
      ]),
  );

  const invoices = (invoiceRows ?? []) as Invoice[];
  const nameById = new Map(
    ((profs ?? []) as ProfileRow[]).map((p) => [p.id, p.full_name || p.email]),
  );

  // Signed URLs for payment proofs (private bucket, generated server-side).
  const admin = createAdminClient();
  const withProof = invoices.filter((i) => i.payment_proof_path);
  const proofUrl = new Map<string, string>();
  if (withProof.length > 0) {
    const { data: signed } = await admin.storage
      .from("payment-proofs")
      .createSignedUrls(
        withProof.map((i) => i.payment_proof_path as string),
        3600,
      );
    signed?.forEach((s, idx) => {
      if (s.signedUrl) proofUrl.set(withProof[idx].id, s.signedUrl);
    });
  }

  const rows: DeptInvoiceRow[] = invoices.map((i) => ({
    id: i.id,
    invoiceNumber: i.invoice_number,
    employeeName: nameById.get(i.created_by) ?? "—",
    vendorName: i.vendor_name,
    reason: i.reason,
    amount: Number(i.amount),
    currency: i.currency,
    status: i.status,
    createdAt: i.created_at,
    proofUrl: proofUrl.get(i.id) ?? null,
  }));

  return (
    <>
      <PageHeader
        title="Department Invoices"
        description="Every invoice posted by your department — search, sort, and view payment proofs."
      />
      <DeptInvoicesList invoices={rows} />
    </>
  );
}
