import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { ChatClient } from "@/components/chat/chat-client";
import type { DirectoryEntry, ConversationSummary } from "@/components/chat/types";
import type { Conversation, ConversationType, Profile } from "@/lib/types";

/**
 * Chat — team messaging built on Supabase Realtime. This Server Component loads
 * the initial state (the team directory, the user's conversations, and unread
 * counts); the client takes over for live messaging. File sharing is handled by
 * pasting links (e.g. Google Drive) into messages — no uploads in this phase.
 */
export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const profile = await requireProfile();
  const { c } = await searchParams;
  const supabase = await createClient();
  const meId = profile.id;

  // Company directory (names for labels + the people pickers).
  const { data: people } = await supabase
    .from("profiles")
    .select("id, full_name, email, deactivated_at")
    .order("full_name", { nullsFirst: false });
  const directory: DirectoryEntry[] = (people ?? []).map((p) => {
    const row = p as Pick<Profile, "id" | "full_name" | "email" | "deactivated_at">;
    return {
      id: row.id,
      name: row.full_name || row.email,
      email: row.email,
      active: !row.deactivated_at,
    };
  });

  // The user's conversations.
  const { data: myParts } = await supabase
    .from("conversation_participants")
    .select("conversation_id, is_admin")
    .eq("profile_id", meId);
  const adminOf = new Map(
    (myParts ?? []).map((p) => [p.conversation_id as string, Boolean(p.is_admin)]),
  );
  const convIds = (myParts ?? []).map((p) => p.conversation_id as string);

  let conversations: ConversationSummary[] = [];
  if (convIds.length > 0) {
    const [{ data: convRows }, { data: allParts }, { data: unread }] =
      await Promise.all([
        supabase.from("conversations").select("*").in("id", convIds),
        supabase
          .from("conversation_participants")
          .select("conversation_id, profile_id")
          .in("conversation_id", convIds),
        supabase.rpc("unread_counts"),
      ]);

    const participantsByConv = new Map<string, string[]>();
    for (const row of allParts ?? []) {
      const cid = row.conversation_id as string;
      const list = participantsByConv.get(cid) ?? [];
      list.push(row.profile_id as string);
      participantsByConv.set(cid, list);
    }
    const unreadByConv = new Map(
      ((unread ?? []) as { conversation_id: string; unread: number }[]).map((u) => [
        u.conversation_id,
        Number(u.unread),
      ]),
    );

    conversations = ((convRows ?? []) as Conversation[]).map((c) => ({
      id: c.id,
      type: c.type as ConversationType,
      name: c.name,
      participantIds: participantsByConv.get(c.id) ?? [],
      amAdmin: adminOf.get(c.id) ?? false,
      unread: unreadByConv.get(c.id) ?? 0,
      lastMessageAt: c.last_message_at,
      lastMessagePreview: c.last_message_preview,
    }));
  }

  return (
    <>
      <PageHeader
        title="Chat"
        description="Direct messages and group conversations, in real time."
      />
      <ChatClient
        me={{ id: meId, name: profile.full_name || profile.email }}
        directory={directory}
        conversations={conversations}
        initialConversationId={c}
      />
    </>
  );
}
