import { createAdminClient } from "@/lib/supabase/admin";
import type { NotificationType } from "@/lib/types";

/**
 * Server-side helpers for creating notifications.
 *
 * Notifications are inserted with the service-role client because one user
 * raising a notification for ANOTHER user is, by design, impossible under Row
 * Level Security (the notifications table has no INSERT policy). These helpers
 * are the single trusted path that writes them, and are only ever imported by
 * Server Actions that have already authenticated the caller.
 */

export interface NewNotification {
  recipientId: string;
  type: NotificationType;
  title: string;
  body?: string;
  /** Where clicking the notification takes the user (e.g. /chat?c=<id>). */
  link?: string;
  /** Structured payload, e.g. { conversationId } so the UI can react locally. */
  data?: Record<string, unknown> | null;
}

/**
 * Insert a batch of notifications. Silently no-ops on an empty list and never
 * throws into the caller — a failure to notify must not fail the underlying
 * action (posting an invoice, sending a message). Errors are logged instead.
 */
export async function notifyUsers(items: NewNotification[]): Promise<void> {
  const rows = items
    .filter((n) => n.recipientId)
    .map((n) => ({
      recipient_id: n.recipientId,
      type: n.type,
      title: n.title,
      body: n.body ?? "",
      link: n.link ?? null,
      data: n.data ?? null,
    }));
  if (rows.length === 0) return;

  try {
    const admin = createAdminClient();
    const { error } = await admin.from("notifications").insert(rows);
    if (error) console.error("notifyUsers insert failed:", error.message);
  } catch (err) {
    // e.g. SUPABASE_SERVICE_ROLE_KEY missing — don't break the caller.
    console.error("notifyUsers failed:", err);
  }
}

/**
 * The profile ids of everyone with billing/staff authority: admins plus members
 * of the HR & Management department. Deactivated accounts are excluded. Used to
 * alert management when a new invoice is posted. Optionally drops `excludeId`
 * (e.g. the poster, so they don't notify themselves).
 */
export async function getManagementUserIds(excludeId?: string): Promise<string[]> {
  try {
    const admin = createAdminClient();

    const { data: admins } = await admin
      .from("profiles")
      .select("id")
      .eq("role", "admin")
      .is("deactivated_at", null);

    const { data: dept } = await admin
      .from("departments")
      .select("id")
      .eq("slug", "hr-management")
      .maybeSingle();

    const ids = new Set<string>((admins ?? []).map((a) => a.id as string));

    if (dept) {
      const { data: members } = await admin
        .from("profile_departments")
        .select("profile_id")
        .eq("department_id", dept.id);
      const memberIds = (members ?? []).map((m) => m.profile_id as string);
      if (memberIds.length > 0) {
        // Keep only active members (exclude soft-removed accounts).
        const { data: active } = await admin
          .from("profiles")
          .select("id")
          .in("id", memberIds)
          .is("deactivated_at", null);
        for (const p of active ?? []) ids.add(p.id as string);
      }
    }

    if (excludeId) ids.delete(excludeId);
    return [...ids];
  } catch (err) {
    console.error("getManagementUserIds failed:", err);
    return [];
  }
}
