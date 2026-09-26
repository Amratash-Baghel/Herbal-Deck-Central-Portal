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

    // The admins and the HR department don't depend on each other.
    const [{ data: admins }, { data: dept }] = await Promise.all([
      admin
        .from("profiles")
        .select("id")
        .eq("role", "admin")
        .is("deactivated_at", null),
      admin
        .from("departments")
        .select("id")
        .eq("slug", "hr-management")
        .maybeSingle(),
    ]);

    const ids = new Set<string>((admins ?? []).map((a) => a.id as string));

    if (dept) {
      // Each member's deactivated_at comes embedded, so soft-removed accounts
      // are dropped without a second lookup.
      type ProfileState = { deactivated_at: string | null };
      const { data: members } = await admin
        .from("profile_departments")
        .select("profile_id, profiles(deactivated_at)")
        .eq("department_id", dept.id);
      for (const m of (members ?? []) as unknown as {
        profile_id: string;
        profiles: ProfileState | ProfileState[] | null;
      }[]) {
        const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
        // Keep only active members (exclude soft-removed accounts).
        if (p && !p.deactivated_at) ids.add(m.profile_id);
      }
    }

    if (excludeId) ids.delete(excludeId);
    return [...ids];
  } catch (err) {
    console.error("getManagementUserIds failed:", err);
    return [];
  }
}
