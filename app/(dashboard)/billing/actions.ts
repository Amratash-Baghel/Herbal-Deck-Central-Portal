"use server";

import { revalidatePath } from "next/cache";
import { getUserAccess, requireBillingManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyUsers, getManagementUserIds } from "@/lib/notifications";
import { formatMoney, type CurrencyCode } from "@/lib/money";

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
  const departmentId = String(formData.get("department_id") ?? "");
  const categoryId = String(formData.get("category_id") ?? "") || null;
  const reason = String(formData.get("reason") ?? "").trim();
  const issueDate = String(formData.get("issue_date") ?? "") || null;
  const currency = String(formData.get("currency") ?? "INR");
  const amount = Number(formData.get("amount") ?? 0);
  const file = formData.get("file");

  if (!vendorName) return { error: "Enter the service provider's name.", success: null };
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
      // invoice_number is assigned by the database (default → next_invoice_number()).
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

  // Alert management (admins + HR & Management) that an invoice needs clearing.
  const managers = await getManagementUserIds(access.profile.id);
  if (managers.length > 0) {
    const amountText = formatMoney(amount, currency as CurrencyCode);
    const poster = access.profile.full_name || access.profile.email;
    await notifyUsers(
      managers.map((recipientId) => ({
        recipientId,
        type: "invoice_posted" as const,
        title: "New invoice to clear",
        body: `${poster} posted ${amountText} for ${vendorName}`,
        link: "/billing/clearing",
        data: { invoiceId: inserted.id },
      })),
    );
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

export interface ClearState {
  error: string | null;
  success: string | null;
}

/**
 * Mark an invoice cleared (billing managers only). A **payment proof** file
 * (image or PDF) is MANDATORY — the invoice can't be cleared without one. The
 * proof is stored in the private `payment-proofs` bucket and its path saved on
 * the invoice, so the poster / team lead / managers can view it afterwards.
 */
export async function clearInvoice(
  _prev: ClearState,
  formData: FormData,
): Promise<ClearState> {
  const access = await requireBillingManager();
  const id = String(formData.get("invoice_id") ?? "");
  if (!id) return { error: "Missing invoice.", success: null };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Payment proof is required to clear an invoice.", success: null };
  }
  const okType =
    file.type.startsWith("image/") || file.type === "application/pdf";
  if (!okType) {
    return { error: "Payment proof must be an image or a PDF.", success: null };
  }

  const admin = createAdminClient();
  const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
  const path = `${id}/proof-${Date.now()}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await admin.storage
    .from("payment-proofs")
    .upload(path, bytes, { contentType: file.type, upsert: true });
  if (upErr) return { error: upErr.message, success: null };

  const supabase = await createClient();
  const { error } = await supabase
    .from("invoices")
    .update({
      status: "cleared",
      cleared_by: access.profile.id,
      cleared_at: new Date().toISOString(),
      payment_proof_path: path,
    })
    .eq("id", id);
  if (error) return { error: error.message, success: null };

  revalidatePath("/billing/clearing");
  revalidatePath("/billing/post");
  revalidatePath("/billing/department");
  return { error: null, success: "Invoice cleared." };
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

export interface PettyCashState {
  error: string | null;
  success: string | null;
}

/**
 * Record a petty cash entry — HR & Management only (also enforced by RLS on
 * `misc_payments`, which every billing manager can read/write). Deliberately
 * three fields: who it was paid to, why, and the amount — always INR.
 */
export async function createPettyCashEntry(
  _prev: PettyCashState,
  formData: FormData,
): Promise<PettyCashState> {
  const access = await getUserAccess();
  if (!access) return { error: "You are not signed in.", success: null };
  if (!access.canManageBilling) {
    return { error: "Only HR & Management can record petty cash.", success: null };
  }

  const paidTo = String(formData.get("paid_to") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const amount = Number(formData.get("amount") ?? 0);

  if (!paidTo) return { error: "Enter who this was paid to.", success: null };
  if (!description) return { error: "Enter a reason.", success: null };
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "Enter a valid amount.", success: null };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("misc_payments").insert({
    created_by: access.profile.id,
    paid_to: paidTo,
    description,
    amount,
    currency: "INR",
  });

  if (error) return { error: error.message, success: null };

  revalidatePath("/billing/petty-cash");
  return { error: null, success: "Recorded." };
}

/** Delete a petty cash entry (billing managers only, enforced by RLS). */
export async function deletePettyCashEntry(formData: FormData): Promise<void> {
  await requireBillingManager();
  const id = String(formData.get("entry_id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("misc_payments").delete().eq("id", id);
  revalidatePath("/billing/petty-cash");
}
