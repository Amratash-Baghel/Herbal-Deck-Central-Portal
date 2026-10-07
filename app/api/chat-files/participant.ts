import { createClient } from "@/lib/supabase/server";

/** The signed-in user's id if they are a participant of the conversation, else null. */
export async function chatParticipant(conversationId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return null;
  const { data: row } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("conversation_id", conversationId)
    .eq("profile_id", userId)
    .maybeSingle();
  return row ? userId : null;
}
