"use server";

import { revalidatePath } from "next/cache";
import {
  getUserAccess,
  requireBillingManager,
} from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeTotals, type InvoiceData } from "@/lib/invoice-pdf";

export interface PostInvoiceState {
  error: string | null;
  success: string | null;
}

/**
 * Server Action: "post" a generated invoice into expense tracking.
 *
 * The employee is taken from the session (created_by = the signed-in user) and
 * the department is validated against their memberships — neither is trusted
 * from the client. The full generator payload is stored in `document` so the
 * exact PDF can be re-downloaded from the record later. Row Level Security
 * independently enforces that created_by must equal the caller.
 */
export async function postInvoice(
  _prev: PostInvoiceState,
  formData: FormData,
): Promise<PostInvoiceState> {
  const access = await getUserAccess();
  if (!access) return { error: "You are not signed in.", success: null };

  const departmentId = String(formData.get("department_id") ?? "");
  const categoryId = String(formData.get("category_id") ?? "") || null;
  const reason = String(formData.get("reason") ?? "").trim();
  const documentRaw = String(formData.get("document") ?? "");

  if (!departmentId) {
    return { error: "Choose the department this invoice belongs to.", success: null };
  }
  if (!reason) {
    return { error: "Add a short reason for posting this invoice.", success: null };
  }

  let doc: InvoiceData;
  try {
    doc = JSON.parse(documentRaw) as InvoiceData;
  } catch {
    return { error: "The invoice data was malformed. Try again.", success: null };
  }
  if (!doc.items?.length) {
    return { error: "Add at least one line item before posting.", success: null };
  }

  const supabase = await createClient();

  // Validate the chosen department: a non-admin can only post to a department
  // they actually belong to.
  if (!access.isAdmin) {
    const { data: membership } = await supabase
      .from("profile_departments")
      .select("department_id")
      .eq("profile_id", access.profile.id)
      .eq("department_id", departmentId)
      .maybeSingle();
    if (!membership) {
      return { error: "You can only post to a department you belong to.", success: null };
    }
  }

  const totals = computeTotals(doc.items, doc.taxRate);

  const { error } = await supabase.from("invoices").insert({
    invoice_number: doc.invoiceNumber || `HD-${new Date().getFullYear()}`,
    created_by: access.profile.id,
    department_id: departmentId,
    category_id: categoryId,
    vendor_name: doc.fromName || null,
    description: doc.notes || null,
    amount: totals.total,
    currency: doc.currency,
    issue_date: doc.issueDate || null,
    due_date: doc.dueDate || null,
    reason,
    document: doc,
    status: "pending",
  });

  if (error) {
    return { error: error.message, success: null };
  }

  revalidatePath("/billing/invoices");
  return { error: null, success: "Posted. It's now awaiting signature and clearing." };
}

/**
 * Delete an invoice. RLS allows this only for admins, or the creator while the
 * invoice is still pending.
 */
export async function deleteInvoice(formData: FormData): Promise<void> {
  const id = String(formData.get("invoice_id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("invoices").delete().eq("id", id);
  revalidatePath("/billing/invoices");
}

/** Mark an invoice cleared (billing managers only), recording who cleared it. */
export async function clearInvoice(formData: FormData): Promise<void> {
  const access = await requireBillingManager();
  const id = String(formData.get("invoice_id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  await supabase
    .from("invoices")
    .update({
      status: "cleared",
      cleared_by: access.profile.id,
      cleared_at: new Date().toISOString(),
    })
    .eq("id", id);
  revalidatePath("/billing/invoices");
}

/** Mark an invoice rejected (billing managers only), recording who rejected it. */
export async function rejectInvoice(formData: FormData): Promise<void> {
  const access = await requireBillingManager();
  const id = String(formData.get("invoice_id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  await supabase
    .from("invoices")
    .update({
      status: "rejected",
      cleared_by: access.profile.id,
      cleared_at: new Date().toISOString(),
    })
    .eq("id", id);
  revalidatePath("/billing/invoices");
}

/**
 * Upload the owner-signed PDF for an invoice (billing managers only). The file
 * goes to the private `invoices` storage bucket via the service-role client
 * (so no storage policies are needed), and its path is recorded on the row.
 */
export async function uploadSignedInvoice(formData: FormData): Promise<void> {
  await requireBillingManager();

  const id = String(formData.get("invoice_id") ?? "");
  const file = formData.get("file");
  if (!id || !(file instanceof File) || file.size === 0) return;

  const admin = createAdminClient();
  const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
  const path = `${id}/signed-${Date.now()}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await admin.storage
    .from("invoices")
    .upload(path, bytes, {
      contentType: file.type || "application/pdf",
      upsert: true,
    });
  if (uploadError) return;

  await admin.from("invoices").update({ file_path: path }).eq("id", id);
  revalidatePath("/billing/invoices");
}
