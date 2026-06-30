"use server";

import { getUserAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyUsers } from "@/lib/notifications";
import type { Message } from "@/lib/types";

/**
 * Server Actions for the Chat module.
 *
 * Reads and ordinary message inserts run through the RLS-scoped anon client, so
 * the database is the authority on who can see and post to a conversation.
 * Anything that crosses users — seeding a conversation's participants, adding
 * someone to a group, and raising notifications for other people — goes through
 * the service-role client AFTER the caller has been authenticated here.
 *
 * Each action returns a small result object the client can act on. Live updates
 * (new messages, unread counts, pings) arrive via Supabase Realtime, so these
 * actions intentionally do not revalidate the page.
 */

const MAX_BODY = 4000;

function displayName(p: { full_name: string | null; email: string }): string {
  return p.full_name || p.email;
}

export interface SendResult {
  ok: boolean;
  error?: string;
  message?: Message;
}

/**
 * Send a message into a conversation. The sender is taken from the session and
 * RLS independently enforces membership. Raises notifications: the recipient of
 * a DM is always pinged; in a group, only @-mentioned members are pinged (group
 * traffic shows up as unread counts in the conversation list instead).
 */
export async function sendMessage(
  conversationId: string,
  rawBody: string,
  mentionIds: string[] = [],
): Promise<SendResult> {
  const access = await getUserAccess();
  if (!access) return { ok: false, error: "You are not signed in." };

  const body = (rawBody ?? "").trim();
  if (!body) return { ok: false, error: "Message is empty." };
  if (body.length > MAX_BODY) return { ok: false, error: "Message is too long." };
  if (!conversationId) return { ok: false, error: "No conversation selected." };

  const supabase = await createClient();
  const me = access.profile.id;

  // Reading the conversation doubles as the membership check (RLS only returns
  // it to participants).
  const { data: convo } = await supabase
    .from("conversations")
    .select("id, type, name")
    .eq("id", conversationId)
    .single();
  if (!convo) return { ok: false, error: "Conversation not found." };

  const { data: parts } = await supabase
    .from("conversation_participants")
    .select("profile_id")
    .eq("conversation_id", conversationId);
  const participantIds = (parts ?? []).map((p) => p.profile_id as string);

  const mentions = [...new Set(mentionIds)].filter(
    (id) => id !== me && participantIds.includes(id),
  );

  const { data: inserted, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_id: me,
      body,
      mentions,
    })
    .select("*")
    .single();

  if (error || !inserted) {
    return { ok: false, error: error?.message ?? "Could not send the message." };
  }

  // Notifications (best-effort; never fail the send).
  const sender = displayName(access.profile);
  const preview = body.length > 140 ? `${body.slice(0, 140)}…` : body;
  const link = `/chat?c=${conversationId}`;

  if (convo.type === "dm") {
    const other = participantIds.find((id) => id !== me);
    if (other) {
      await notifyUsers([
        {
          recipientId: other,
          type: "message",
          title: sender,
          body: preview,
          link,
          data: { conversationId },
        },
      ]);
    }
  } else if (mentions.length > 0) {
    const where = convo.name ? ` in ${convo.name}` : "";
    await notifyUsers(
      mentions.map((recipientId) => ({
        recipientId,
        type: "mention" as const,
        title: `${sender} mentioned you${where}`,
        body: preview,
        link,
        data: { conversationId },
      })),
    );
  }

  return { ok: true, message: inserted as Message };
}

export interface ConversationResult {
  ok: boolean;
  error?: string;
  conversationId?: string;
}

/**
 * Open (or create) a direct message with another employee. Returns the existing
 * DM if one already exists, so a pair of people always share a single thread.
 */
export async function startDirectMessage(
  otherUserId: string,
): Promise<ConversationResult> {
  const access = await getUserAccess();
  if (!access) return { ok: false, error: "You are not signed in." };
  const me = access.profile.id;
  if (!otherUserId || otherUserId === me) {
    return { ok: false, error: "Pick someone else to message." };
  }

  const supabase = await createClient();

  // Other person must be an active employee.
  const { data: other } = await supabase
    .from("profiles")
    .select("id, deactivated_at")
    .eq("id", otherUserId)
    .single();
  if (!other || other.deactivated_at) {
    return { ok: false, error: "That employee is not available." };
  }

  // Look for an existing DM between the two of us.
  const { data: myParts } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("profile_id", me);
  const myConvIds = (myParts ?? []).map((p) => p.conversation_id as string);

  if (myConvIds.length > 0) {
    const { data: myDms } = await supabase
      .from("conversations")
      .select("id")
      .eq("type", "dm")
      .in("id", myConvIds);
    const dmIds = (myDms ?? []).map((c) => c.id as string);
    if (dmIds.length > 0) {
      const { data: shared } = await supabase
        .from("conversation_participants")
        .select("conversation_id")
        .eq("profile_id", otherUserId)
        .in("conversation_id", dmIds);
      if (shared && shared.length > 0) {
        return { ok: true, conversationId: shared[0].conversation_id as string };
      }
    }
  }

  // None exists — create it (admin client seeds both participants atomically).
  const admin = createAdminClient();
  const { data: convo, error } = await admin
    .from("conversations")
    .insert({ type: "dm", created_by: me })
    .select("id")
    .single();
  if (error || !convo) {
    return { ok: false, error: error?.message ?? "Could not start the chat." };
  }
  const { error: pErr } = await admin.from("conversation_participants").insert([
    { conversation_id: convo.id, profile_id: me, is_admin: false },
    { conversation_id: convo.id, profile_id: otherUserId, is_admin: false },
  ]);
  if (pErr) return { ok: false, error: pErr.message };

  return { ok: true, conversationId: convo.id as string };
}

/**
 * Create a group conversation. The creator becomes its admin; the chosen
 * members are added and notified.
 */
export async function createGroup(
  rawName: string,
  memberIds: string[],
): Promise<ConversationResult> {
  const access = await getUserAccess();
  if (!access) return { ok: false, error: "You are not signed in." };
  const me = access.profile.id;

  const name = (rawName ?? "").trim();
  if (!name) return { ok: false, error: "Give the group a name." };

  const supabase = await createClient();
  const wanted = [...new Set(memberIds)].filter((id) => id && id !== me);
  if (wanted.length === 0) {
    return { ok: false, error: "Add at least one other member." };
  }

  const { data: valid } = await supabase
    .from("profiles")
    .select("id")
    .in("id", wanted)
    .is("deactivated_at", null);
  const members = (valid ?? []).map((p) => p.id as string);
  if (members.length === 0) {
    return { ok: false, error: "None of the selected members are available." };
  }

  const admin = createAdminClient();
  const { data: convo, error } = await admin
    .from("conversations")
    .insert({ type: "group", name, created_by: me })
    .select("id")
    .single();
  if (error || !convo) {
    return { ok: false, error: error?.message ?? "Could not create the group." };
  }

  const rows = [
    { conversation_id: convo.id, profile_id: me, is_admin: true },
    ...members.map((id) => ({
      conversation_id: convo.id,
      profile_id: id,
      is_admin: false,
    })),
  ];
  const { error: pErr } = await admin
    .from("conversation_participants")
    .insert(rows);
  if (pErr) return { ok: false, error: pErr.message };

  await notifyUsers(
    members.map((recipientId) => ({
      recipientId,
      type: "group_added" as const,
      title: `${displayName(access.profile)} added you to ${name}`,
      body: "Tap to open the group.",
      link: `/chat?c=${convo.id}`,
      data: { conversationId: convo.id },
    })),
  );

  return { ok: true, conversationId: convo.id as string };
}

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/** Verify the caller is an admin of the given group. */
async function requireGroupAdmin(
  conversationId: string,
  profileId: string,
): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("conversation_participants")
    .select("is_admin")
    .eq("conversation_id", conversationId)
    .eq("profile_id", profileId)
    .maybeSingle();
  if (!data) return "You are not in this group.";
  if (!data.is_admin) return "Only group admins can do that.";
  return null;
}

/** Rename a group (group admins only). */
export async function renameGroup(
  conversationId: string,
  rawName: string,
): Promise<ActionResult> {
  const access = await getUserAccess();
  if (!access) return { ok: false, error: "You are not signed in." };
  const name = (rawName ?? "").trim();
  if (!name) return { ok: false, error: "Enter a name." };

  const denied = await requireGroupAdmin(conversationId, access.profile.id);
  if (denied) return { ok: false, error: denied };

  const supabase = await createClient();
  const { error } = await supabase
    .from("conversations")
    .update({ name })
    .eq("id", conversationId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Add members to a group (group admins only). New members are notified. */
export async function addGroupMembers(
  conversationId: string,
  memberIds: string[],
): Promise<ActionResult> {
  const access = await getUserAccess();
  if (!access) return { ok: false, error: "You are not signed in." };

  const denied = await requireGroupAdmin(conversationId, access.profile.id);
  if (denied) return { ok: false, error: denied };

  const supabase = await createClient();
  const { data: convo } = await supabase
    .from("conversations")
    .select("type, name")
    .eq("id", conversationId)
    .single();
  if (!convo || convo.type !== "group") {
    return { ok: false, error: "That is not a group." };
  }

  const { data: existing } = await supabase
    .from("conversation_participants")
    .select("profile_id")
    .eq("conversation_id", conversationId);
  const already = new Set((existing ?? []).map((p) => p.profile_id as string));

  const wanted = [...new Set(memberIds)].filter((id) => id && !already.has(id));
  if (wanted.length === 0) return { ok: false, error: "No new members to add." };

  const { data: valid } = await supabase
    .from("profiles")
    .select("id")
    .in("id", wanted)
    .is("deactivated_at", null);
  const toAdd = (valid ?? []).map((p) => p.id as string);
  if (toAdd.length === 0) return { ok: false, error: "Those members are not available." };

  const admin = createAdminClient();
  const { error } = await admin.from("conversation_participants").insert(
    toAdd.map((id) => ({
      conversation_id: conversationId,
      profile_id: id,
      is_admin: false,
    })),
  );
  if (error) return { ok: false, error: error.message };

  await notifyUsers(
    toAdd.map((recipientId) => ({
      recipientId,
      type: "group_added" as const,
      title: `${displayName(access.profile)} added you to ${convo.name ?? "a group"}`,
      body: "Tap to open the group.",
      link: `/chat?c=${conversationId}`,
      data: { conversationId },
    })),
  );

  return { ok: true };
}

/** Remove a member from a group (group admins only; not yourself — use leave). */
export async function removeGroupMember(
  conversationId: string,
  memberId: string,
): Promise<ActionResult> {
  const access = await getUserAccess();
  if (!access) return { ok: false, error: "You are not signed in." };
  if (memberId === access.profile.id) {
    return { ok: false, error: "Use “Leave group” to remove yourself." };
  }

  const denied = await requireGroupAdmin(conversationId, access.profile.id);
  if (denied) return { ok: false, error: denied };

  const admin = createAdminClient();
  const { error } = await admin
    .from("conversation_participants")
    .delete()
    .eq("conversation_id", conversationId)
    .eq("profile_id", memberId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Leave a group. RLS lets a member delete their own participant row. */
export async function leaveGroup(conversationId: string): Promise<ActionResult> {
  const access = await getUserAccess();
  if (!access) return { ok: false, error: "You are not signed in." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("conversation_participants")
    .delete()
    .eq("conversation_id", conversationId)
    .eq("profile_id", access.profile.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
