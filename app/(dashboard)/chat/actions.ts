"use server";

import { getUserAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyUsers } from "@/lib/notifications";
import { sanitizeAttachments, type Attachment } from "@/lib/chat-attachments";
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
  rawAttachments: Attachment[] = [],
  options?: { replyToId?: string; clientRequestId: string },
): Promise<SendResult> {
  const access = await getUserAccess();
  if (!access) return { ok: false, error: "You are not signed in." };

  const body = (rawBody ?? "").trim();
  if (body.length > MAX_BODY) return { ok: false, error: "Message is too long." };
  if (!conversationId) return { ok: false, error: "No conversation selected." };

  // Recompute mime/kind from the (allowed) extension and confirm each file lives
  // under this conversation's folder — a client can't spoof either.
  const attachments = sanitizeAttachments(conversationId, rawAttachments);
  if (attachments === null) {
    return { ok: false, error: "One of the attachments looks invalid." };
  }
  if (!body && attachments.length === 0) {
    return { ok: false, error: "Message is empty." };
  }

  const supabase = await createClient();
  const me = access.profile.id;
  if (options && !/^[0-9a-f-]{36}$/i.test(options.clientRequestId)) return {ok:false,error:"Invalid send request."};
  if (options) {
    const {data: previous} = await supabase.from("messages").select("*")
      .eq("sender_id", me).eq("client_request_id", options.clientRequestId).maybeSingle();
    if (previous) return previous.conversation_id === conversationId
      ? {ok:true, message:previous as Message} : {ok:false,error:"Request belongs to another conversation."};
  }

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
      attachments,
      ...(options ? {reply_to_id: options.replyToId || null, client_request_id: options.clientRequestId} : {}),
    })
    .select("*")
    .single();

  if (error || !inserted) {
    if (error?.code === "23505" && options) {
      const {data: previous} = await supabase.from("messages").select("*")
        .eq("sender_id",me).eq("client_request_id",options.clientRequestId).eq("conversation_id",conversationId).maybeSingle();
      if (previous) return {ok:true, message:previous as Message};
    }
    return { ok: false, error: error?.message ?? "Could not send the message." };
  }

  // Notifications (best-effort; never fail the send).
  const sender = displayName(access.profile);
  const attachLabel =
    attachments.length > 0
      ? `📎 ${attachments.length === 1 ? attachments[0].name : `${attachments.length} files`}`
      : "";
  const previewText = body || attachLabel;
  const preview =
    previewText.length > 140 ? `${previewText.slice(0, 140)}…` : previewText;
  const link = `/chat?c=${conversationId}`;

  try { if (convo.type === "dm") {
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

  } catch { console.warn("Chat message saved; notification delivery failed."); }
  return { ok: true, message: inserted as Message };
}

/** New mutations always run with the signed-in user's RLS-scoped client. */
export async function editChatMessage(messageId: string, body: string): Promise<SendResult> {
  if (!await getUserAccess()) return {ok:false,error:"You are not signed in."};
  const supabase = await createClient();
  const {data,error} = await supabase.rpc("edit_chat_message", {message_id:messageId,body});
  return error ? {ok:false,error:error.message} : {ok:true,message:data as Message};
}
export async function deleteChatMessage(messageId: string): Promise<SendResult> {
  if (!await getUserAccess()) return {ok:false,error:"You are not signed in."};
  const supabase = await createClient();
  const {data,error} = await supabase.rpc("delete_chat_message", {message_id:messageId});
  return error ? {ok:false,error:error.message} : {ok:true,message:data as Message};
}
export async function setMessageReaction(messageId: string, emoji: string, enabled: boolean): Promise<ActionResult> {
  const access = await getUserAccess();
  if (!access) return {ok:false,error:"You are not signed in."};
  if (!["👍","❤️","🎉","👀","✅","🙏"].includes(emoji)) return {ok:false,error:"Unsupported reaction."};
  const supabase = await createClient();
  const result = enabled
    ? await supabase.from("message_reactions").upsert({message_id:messageId,profile_id:access.profile.id,emoji},{onConflict:"message_id,profile_id,emoji",ignoreDuplicates:true})
    : await supabase.from("message_reactions").delete().eq("message_id",messageId).eq("profile_id",access.profile.id).eq("emoji",emoji);
  return result.error ? {ok:false,error:result.error.message} : {ok:true};
}
export async function setMessagePin(messageId: string, enabled: boolean): Promise<ActionResult> {
  const access = await getUserAccess();
  if (!access) return {ok:false,error:"You are not signed in."};
  const supabase = await createClient();
  const result = enabled
    ? await supabase.from("conversation_pins").upsert({message_id:messageId,pinned_by:access.profile.id},{onConflict:"message_id",ignoreDuplicates:true})
    : await supabase.from("conversation_pins").delete().eq("message_id",messageId).select("message_id");
  if (result.error) return {ok:false,error:result.error.message};
  if (!enabled && !result.data?.length) return {ok:false,error:"Only the person who pinned this message or a group admin can unpin it."};
  return {ok:true};
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
