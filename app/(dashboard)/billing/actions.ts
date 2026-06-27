"use server";

import { revalidatePath } from "next/cache";
import { getUserAccess, requireBillingManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface PostInvoiceState {
  error: string | null;
  success: string | null;
}

/**
 * Server Action: post an invoice into tracking. The employee is taken from the
 * session and the department is validated against their memberships — neither
 * is trusted from the client. An optional file (the generated / signed PDF) is
 * stored in the private `invoices` bucket via the service-role client. RLS
 * independently enforces that created_by must equal the caller.
 */
export async function createPostedInvoice(
  _prev: PostInvoiceState,
  formData: FormData,
): Promise<PostInvoiceState> {
  const access = await getUserAccess();
  if (!access) return { error: "You are not signed in.", success: null };

  const vendorName = String(formData.get("vendor_name") ?? "").trim();
  const invoiceNumber = String(formData.get("invoice_number") ?? "").trim();
  const departmentId = String(formData.get("department_id") ?? "");
  const categoryId = String(formData.get("category_id") ?? "") || null;
  const reason = String(formData.get("reason") ?? "").trim();
  const issueDate = String(formData.get("issue_date") ?? "") || null;
  const currency = String(formData.get("currency") ?? "INR");
  const amount = Number(formData.get("amount") ?? 0);
  const file = formData.get("file");

  if (!vendorName) return { error: "Enter the service provider's name.", success: null };
  if (!invoiceNumber) return { error: "Enter the invoice number.", success: null };
  if (!departmentId) return { error: "Choose a department.", success: null };
  if (!reason) return { error: "Add a short reason for posting.", success: null };
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "Enter a valid amount.", success: null };
  }

  const supabase = await createClient();

  // A non-admin may only post to a department they belong to.
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

  const { data: inserted, error } = await supabase
    .from("invoices")
    .insert({
      invoice_number: invoiceNumber,
      created_by: access.profile.id,
      department_id: departmentId,
      category_id: categoryId,
      vendor_name: vendorName,
      amount,
      currency,
      issue_date: issueDate,
      reason,
      status: "pending",
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return { error: error?.message ?? "Could not post the invoice.", success: null };
  }

  // Attach the uploaded file, if any.
  if (file instanceof File && file.size > 0) {
    const admin = createAdminClient();
    const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
    const path = `${inserted.id}/source-${Date.now()}.${ext}`;
    const bytes = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await admin.storage
      .from("invoices")
      .upload(path, bytes, {
        contentType: file.type || "application/pdf",
        upsert: true,
      });
    if (!upErr) {
      await admin.from("invoices").update({ file_path: path }).eq("id", inserted.id);
    }
  }

  revalidatePath("/billing/post");
  revalidatePath("/billing/clearing");
  return { error: null, success: "Posted. It's now pending clearing." };
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
  revalidatePath("/billing/post");
  revalidatePath("/billing/clearing");
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
  revalidatePath("/billing/clearing");
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
  revalidatePath("/billing/clearing");
}

/**
 * Upload (or replace) the invoice PDF for a record (billing managers only).
 * Stored in the private `invoices` bucket via the service-role client.
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
  const { error } = await admin.storage.from("invoices").upload(path, bytes, {
    contentType: file.type || "application/pdf",
    upsert: true,
  });
  if (error) return;

  await admin.from("invoices").update({ file_path: path }).eq("id", id);
  revalidatePath("/billing/clearing");
}
