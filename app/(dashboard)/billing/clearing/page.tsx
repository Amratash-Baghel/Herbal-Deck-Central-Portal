import Link from "next/link";
import { requireBillingManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/page-header";
import { InvoiceStatusBadge } from "@/components/invoice-status-badge";
import { InvoiceManageActions } from "@/components/invoice-manage-actions";
import { InvoiceSearch } from "@/components/invoice-search";
import { formatMoney, type CurrencyCode } from "@/lib/money";
import type { Invoice, InvoiceStatus } from "@/lib/types";

type Named = { id: string; name: string };
type Search = { status?: string; dept?: string; q?: string; sort?: string };

const STATUS_TABS: { value: string; label: string }[] = [
  { value: "", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "cleared", label: "Cleared" },
  { value: "rejected", label: "Rejected" },
];

const SORTS: { value: string; label: string }[] = [
  { value: "date_desc", label: "Newest" },
  { value: "date_asc", label: "Oldest" },
  { value: "amount_desc", label: "Highest" },
  { value: "amount_asc", label: "Lowest" },
];

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

function hrefWith(base: Search, overrides: Search): string {
  const merged: Record<string, string | undefined> = { ...base, ...overrides };
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v) usp.set(k, v);
  const s = usp.toString();
  return s ? `/billing/clearing?${s}` : "/billing/clearing";
}

/**
 * Clearing dashboard — admins and HR & Management only (enforced here and by
 * RLS). Department panels, status views, search, and sort. Managers upload the
 * signed copy and clear or reject.
 */
export default async function ClearingPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  await requireBillingManager();
  const sp = await searchParams;
  const current: Search = {
    status: sp.status,
    dept: sp.dept,
    q: sp.q,
    sort: sp.sort,
  };

  const supabase = await createClient();
  const [invoiceRes, deptRes, catRes] = await Promise.all([
    supabase.from("invoices").select("*").order("created_at", { ascending: false }),
    supabase.from("departments").select("id, name").order("name"),
    supabase.from("invoice_categories").select("id, name"),
  ]);

  const all = (invoiceRes.data as Invoice[]) ?? [];
  const departments = (deptRes.data as Named[]) ?? [];
  const deptName = new Map(departments.map((d) => [d.id, d.name]));
  const catName = new Map(
    ((catRes.data ?? []) as Named[]).map((c) => [c.id, c.name]),
  );

  // Department panels: count + total across every status, computed before
  // filtering so the numbers stay stable as you click around.
  const deptStats = new Map<string, { count: number; total: number }>();
  for (const inv of all) {
    const s = deptStats.get(inv.department_id) ?? { count: 0, total: 0 };
    s.count += 1;
    s.total += Number(inv.amount) || 0;
    deptStats.set(inv.department_id, s);
  }

  // Apply filters + sort.
  const q = (current.q ?? "").toLowerCase();
  let invoices = all.filter((inv) => {
    if (current.dept && inv.department_id !== current.dept) return false;
    if (current.status && inv.status !== current.status) return false;
    if (q) {
      const hay = `${inv.vendor_name ?? ""} ${inv.invoice_number} ${inv.reason ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const sort = current.sort ?? "date_desc";
  invoices = [...invoices].sort((a, b) => {
    switch (sort) {
      case "date_asc":
        return a.created_at.localeCompare(b.created_at);
      case "amount_desc":
        return (Number(b.amount) || 0) - (Number(a.amount) || 0);
      case "amount_asc":
        return (Number(a.amount) || 0) - (Number(b.amount) || 0);
      default:
        return b.created_at.localeCompare(a.created_at);
    }
  });

  // Resolve names + signed URLs (service-role: server-side, read-only).
  const admin = createAdminClient();
  const personIds = Array.from(
    new Set(
      invoices.flatMap((i) =>
        [i.created_by, i.cleared_by].filter((x): x is string => Boolean(x)),
      ),
    ),
  );
  const profilesRes = personIds.length
    ? await admin.from("profiles").select("id, full_name, email").in("id", personIds)
    : { data: [] as { id: string; full_name: string | null; email: string }[] };
  const nameById = new Map(
    (profilesRes.data ?? []).map((p) => [p.id, p.full_name || p.email]),
  );

  const signedUrl = new Map<string, string>();
  await Promise.all(
    invoices
      .filter((i) => i.file_path)
      .map(async (i) => {
        const { data } = await admin.storage
          .from("invoices")
          .createSignedUrl(i.file_path as string, 3600);
        if (data?.signedUrl) signedUrl.set(i.id, data.signedUrl);
      }),
  );

  const statusCount = (s: InvoiceStatus) => all.filter((i) => i.status === s).length;
  const allCount = all.length;

  return (
    <>
      <PageHeader
        title="Clear Invoices"
        description="Review posted invoices by department and status, then clear or reject."
      />

      {/* Department panels */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Link
          href={hrefWith(current, { dept: undefined })}
          className={`rounded-2xl border p-4 transition hover:border-primary/40 ${
            !current.dept ? "border-primary bg-accent" : "bg-card"
          }`}
        >
          <p className="text-sm font-semibold">All departments</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {allCount} {allCount === 1 ? "invoice" : "invoices"}
          </p>
        </Link>
        {departments.map((d) => {
          const stats = deptStats.get(d.id) ?? { count: 0, total: 0 };
          const active = current.dept === d.id;
          return (
            <Link
              key={d.id}
              href={hrefWith(current, { dept: d.id })}
              className={`rounded-2xl border p-4 transition hover:border-primary/40 ${
                active ? "border-primary bg-accent" : "bg-card"
              }`}
            >
              <p className="truncate text-sm font-semibold">{d.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {stats.count} · {formatMoney(stats.total, "INR")}
              </p>
            </Link>
          );
        })}
      </div>

      {/* Status tabs + search + sort */}
      <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {STATUS_TABS.map((tab) => {
            const active = (current.status ?? "") === tab.value;
            const count =
              tab.value === ""
                ? allCount
                : statusCount(tab.value as InvoiceStatus);
            return (
              <Link
                key={tab.value || "all"}
                href={hrefWith(current, { status: tab.value || undefined })}
                className={`rounded-xl border px-3 py-1.5 text-sm font-medium transition ${
                  active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"
                }`}
              >
                {tab.label}
                <span className="ml-1.5 text-xs opacity-70">{count}</span>
              </Link>
            );
          })}
        </div>
        <InvoiceSearch />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Sort:</span>
        {SORTS.map((s) => {
          const active = (current.sort ?? "date_desc") === s.value;
          return (
            <Link
              key={s.value}
              href={hrefWith(current, { sort: s.value })}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                active ? "bg-accent text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s.label}
            </Link>
          );
        })}
      </div>

      {/* List */}
      {invoices.length === 0 ? (
        <div className="mt-6 flex min-h-[200px] flex-col items-center justify-center rounded-2xl border border-dashed bg-muted/40 p-10 text-center">
          <h2 className="text-lg font-medium">No invoices match</h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Try a different department, status, or search.
          </p>
        </div>
      ) : (
        <ul className="mt-6 space-y-4">
          {invoices.map((invoice) => {
            const currency = (invoice.currency as CurrencyCode) ?? "INR";
            const url = signedUrl.get(invoice.id);
            return (
              <li key={invoice.id} className="rounded-2xl border bg-card p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold tracking-tight">
                        {invoice.vendor_name || "Service provider"}
                      </span>
                      <InvoiceStatusBadge status={invoice.status} />
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      #{invoice.invoice_number} · Posted by{" "}
                      {nameById.get(invoice.created_by) ?? "—"} ·{" "}
                      {deptName.get(invoice.department_id) ?? "—"}
                      {invoice.category_id &&
                        ` · ${catName.get(invoice.category_id) ?? ""}`}
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
                  {url ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border px-2.5 py-1.5 text-xs font-medium transition hover:bg-accent"
                    >
                      View PDF
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      No file attached
                    </span>
                  )}
                  <InvoiceManageActions
                    invoiceId={invoice.id}
                    status={invoice.status}
                    canManage
                    canDelete
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
