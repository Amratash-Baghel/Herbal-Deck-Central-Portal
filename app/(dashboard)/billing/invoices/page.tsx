import Link from "next/link";
import { getUserAccess } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/page-header";
import { InvoiceDownloadButton } from "@/components/invoice-download-button";
import { InvoiceManageActions } from "@/components/invoice-manage-actions";
import { formatMoney, type CurrencyCode } from "@/lib/money";
import type { Invoice, InvoiceStatus } from "@/lib/types";

const STATUS_STYLES: Record<InvoiceStatus, string> = {
  pending:
    "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  cleared: "bg-primary text-primary-foreground",
  rejected: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300",
};

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

/**
 * Expense tracking — the list of posted invoices. RLS decides which rows each
 * viewer sees: employees see their department's invoices; billing managers see
 * everything and get the clear / reject / upload controls.
 */
export default async function InvoicesPage() {
  const access = await getUserAccess();
  if (!access) redirect("/login");

  const supabase = await createClient();
  const { data: invoiceData } = await supabase
    .from("invoices")
    .select("*")
    .order("created_at", { ascending: false });

  const invoices = (invoiceData as Invoice[]) ?? [];

  // Resolve display names, departments, categories, and signed-PDF links. We
  // use the service-role client for the name lookup because employees can't
  // read teammates' profile rows under RLS — this is server-side, read-only.
  const admin = createAdminClient();
  const personIds = Array.from(
    new Set(
      invoices.flatMap((i) =>
        [i.created_by, i.cleared_by].filter((x): x is string => Boolean(x)),
      ),
    ),
  );

  const [profilesRes, deptRes, catRes] = await Promise.all([
    personIds.length
      ? admin.from("profiles").select("id, full_name, email").in("id", personIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null; email: string }[] }),
    supabase.from("departments").select("id, name"),
    supabase.from("invoice_categories").select("id, name"),
  ]);

  const nameById = new Map(
    ((profilesRes.data ?? []) as {
      id: string;
      full_name: string | null;
      email: string;
    }[]).map((p) => [p.id, p.full_name || p.email]),
  );
  const deptById = new Map(
    ((deptRes.data ?? []) as { id: string; name: string }[]).map((d) => [
      d.id,
      d.name,
    ]),
  );
  const catById = new Map(
    ((catRes.data ?? []) as { id: string; name: string }[]).map((c) => [
      c.id,
      c.name,
    ]),
  );

  // Signed URLs for any uploaded signed PDFs (1-hour expiry).
  const signedUrlById = new Map<string, string>();
  await Promise.all(
    invoices
      .filter((i) => i.file_path)
      .map(async (i) => {
        const { data } = await admin.storage
          .from("invoices")
          .createSignedUrl(i.file_path as string, 3600);
        if (data?.signedUrl) signedUrlById.set(i.id, data.signedUrl);
      }),
  );

  return (
    <>
      <PageHeader
        title="Posted Invoices"
        description={
          access.canManageBilling
            ? "Every posted invoice. Upload the signed copy, then clear or reject."
            : "Invoices posted in your department(s)."
        }
      />

      <div className="mb-6">
        <Link
          href="/billing/generate"
          className="inline-flex items-center rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-90"
        >
          + Create an invoice
        </Link>
      </div>

      {invoices.length === 0 ? (
        <div className="flex min-h-[240px] flex-col items-center justify-center rounded-2xl border border-dashed bg-muted/40 p-10 text-center">
          <h2 className="text-lg font-medium">No invoices yet</h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Create an invoice and post it — it&apos;ll show up here for signing
            and clearing.
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {invoices.map((invoice) => {
            const currency = (invoice.currency as CurrencyCode) ?? "INR";
            const canDelete =
              access.isAdmin ||
              (invoice.created_by === access.profile.id &&
                invoice.status === "pending");
            const signedUrl = signedUrlById.get(invoice.id);

            return (
              <li
                key={invoice.id}
                className="rounded-2xl border bg-card p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold tracking-tight">
                        {invoice.vendor_name || "Service provider"}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[invoice.status]}`}
                      >
                        {invoice.status}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      #{invoice.invoice_number} · Posted by{" "}
                      {nameById.get(invoice.created_by) ?? "—"} ·{" "}
                      {deptById.get(invoice.department_id) ?? "—"}
                      {invoice.category_id &&
                        ` · ${catById.get(invoice.category_id) ?? ""}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-semibold">
                      {formatMoney(Number(invoice.amount), currency)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Issued {formatDate(invoice.issue_date)}
                    </p>
                  </div>
                </div>

                {invoice.reason && (
                  <p className="mt-3 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">Reason:</span>{" "}
                    {invoice.reason}
                  </p>
                )}

                {invoice.status !== "pending" && invoice.cleared_by && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {invoice.status === "cleared" ? "Cleared" : "Rejected"} by{" "}
                    {nameById.get(invoice.cleared_by) ?? "—"} on{" "}
                    {formatDate(invoice.cleared_at)}
                  </p>
                )}

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                  <div className="flex flex-wrap items-center gap-2">
                    {invoice.document && (
                      <InvoiceDownloadButton document={invoice.document} />
                    )}
                    {signedUrl && (
                      <a
                        href={signedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg border px-2.5 py-1.5 text-xs font-medium transition hover:bg-accent"
                      >
                        View signed PDF
                      </a>
                    )}
                  </div>
                  <InvoiceManageActions
                    invoiceId={invoice.id}
                    status={invoice.status}
                    canManage={access.canManageBilling}
                    canDelete={canDelete}
                    hasSignedFile={Boolean(invoice.file_path)}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
