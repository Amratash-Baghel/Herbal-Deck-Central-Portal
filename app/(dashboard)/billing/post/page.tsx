import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/page-header";
import { PostInvoiceForm } from "@/components/post-invoice-form";
import { InvoiceStatusBadge } from "@/components/invoice-status-badge";
import { InvoiceManageActions } from "@/components/invoice-manage-actions";
import { formatMoney, type CurrencyCode } from "@/lib/money";
import type { Invoice } from "@/lib/types";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

type Named = { id: string; name: string };

/**
 * Post section: the form to post an invoice, plus the list of invoices the
 * current employee has posted (with live status). Clearing happens elsewhere.
 */
export default async function PostInvoicePage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const [deptRes, catRes, mineRes] = await Promise.all([
    supabase
      .from("profile_departments")
      .select("departments(id, name)")
      .eq("profile_id", profile.id),
    supabase.from("invoice_categories").select("id, name").order("name"),
    supabase
      .from("invoices")
      .select("*")
      .eq("created_by", profile.id)
      .order("created_at", { ascending: false }),
  ]);

  // FK embeds come back as one row but are typed as arrays — normalise.
  const departments: Named[] = ((deptRes.data ?? []) as Array<{
    departments: Named | Named[] | null;
  }>)
    .map((row) =>
      Array.isArray(row.departments) ? (row.departments[0] ?? null) : row.departments,
    )
    .filter((d): d is Named => Boolean(d));

  const categories = (catRes.data as Named[]) ?? [];
  const mine = (mineRes.data as Invoice[]) ?? [];
  const deptName = new Map(departments.map((d) => [d.id, d.name]));

  // Signed URLs for any attached files.
  const admin = createAdminClient();
  const signedUrl = new Map<string, string>();
  await Promise.all(
    mine
      .filter((i) => i.file_path)
      .map(async (i) => {
        const { data } = await admin.storage
          .from("invoices")
          .createSignedUrl(i.file_path as string, 3600);
        if (data?.signedUrl) signedUrl.set(i.id, data.signedUrl);
      }),
  );

  return (
    <>
      <PageHeader
        title="Post Invoices"
        description="Record a generated invoice into tracking so management can clear it."
      />

      <div className="space-y-8">
        <PostInvoiceForm departments={departments} categories={categories} />

        <div className="rounded-2xl border bg-card shadow-sm">
          <div className="border-b px-6 py-4">
            <h2 className="text-base font-semibold tracking-tight">
              Your posted invoices
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {mine.length} {mine.length === 1 ? "invoice" : "invoices"}
            </p>
          </div>

          {mine.length === 0 ? (
            <p className="px-6 py-8 text-sm text-muted-foreground">
              Nothing posted yet.
            </p>
          ) : (
            <ul className="divide-y">
              {mine.map((invoice) => {
                const currency = (invoice.currency as CurrencyCode) ?? "INR";
                const url = signedUrl.get(invoice.id);
                return (
                  <li key={invoice.id} className="px-6 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {invoice.vendor_name || "Service provider"}
                          </span>
                          <InvoiceStatusBadge status={invoice.status} />
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          #{invoice.invoice_number} ·{" "}
                          {deptName.get(invoice.department_id) ?? "—"} ·{" "}
                          {formatDate(invoice.issue_date)}
                        </p>
                        {invoice.reason && (
                          <p className="mt-1 text-sm text-muted-foreground">
                            {invoice.reason}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span className="font-semibold">
                          {formatMoney(Number(invoice.amount), currency)}
                        </span>
                        <div className="flex items-center gap-2">
                          {url && (
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-lg border px-2.5 py-1.5 text-xs font-medium transition hover:bg-accent"
                            >
                              View PDF
                            </a>
                          )}
                          <InvoiceManageActions
                            invoiceId={invoice.id}
                            status={invoice.status}
                            canManage={false}
                            canDelete={invoice.status === "pending"}
                            hasSignedFile={Boolean(invoice.file_path)}
                          />
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
