import { ChatPreview } from "@/components/chat/preview/chat-preview";
import { notFound } from "next/navigation";

// Public design review contains fictional data only. Authenticated history stays
// behind the existing dashboard layout and its normal authorization checks.
export default async function ChatDesignPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { c } = await searchParams;
  return <main className="cp-public" style={{ maxWidth: 1560, margin: "0 auto", padding: "26px 28px 20px" }}>
    <ChatPreview
      initialConversationId={c?.startsWith("local-") ? c : undefined}
      me={{ id: "preview-you", name: "You" }}
      directory={[
        { id: "preview-you", name: "You", email: "", active: true, color: "#10663c" },
        { id: "preview-maya", name: "Maya Sen", email: "", active: true, color: "#8560a7" },
        { id: "preview-kabir", name: "Kabir Shah", email: "", active: true, color: "#397e86" },
        { id: "preview-isha", name: "Isha Verma", email: "", active: true, color: "#a86944" },
      ]}
      conversations={[
        { id: "local-maya", type: "dm", name: null, participantIds: ["preview-you", "preview-maya"], amAdmin: false, unread: 0, lastMessageAt: null, lastMessagePreview: "Start a local conversation" },
        { id: "local-launch", type: "group", name: "Launch planning", participantIds: ["preview-you", "preview-kabir", "preview-isha"], amAdmin: true, unread: 0, lastMessageAt: null, lastMessagePreview: "Try a group conversation" },
      ]}
    />
  </main>;
}
