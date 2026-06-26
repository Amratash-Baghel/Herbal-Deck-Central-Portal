import { PageHeader } from "@/components/page-header";

/**
 * Chat — placeholder UI only. Real-time messaging will be implemented later
 * using Supabase Realtime. This shows the intended layout: a conversation list
 * beside a message thread.
 */
export default function ChatPage() {
  return (
    <>
      <PageHeader
        title="Chat"
        description="Team messaging — coming soon, powered by Supabase Realtime."
      />

      <div className="grid min-h-[420px] grid-cols-1 gap-5 md:grid-cols-[260px_1fr]">
        {/* Conversation list (placeholder) */}
        <div className="rounded-2xl border bg-card p-4">
          <p className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Conversations
          </p>
          <ul className="mt-3 space-y-2">
            {[1, 2, 3].map((i) => (
              <li
                key={i}
                className="flex items-center gap-3 rounded-xl p-2"
                aria-hidden="true"
              >
                <span className="h-9 w-9 shrink-0 rounded-full bg-muted" />
                <span className="flex-1 space-y-1.5">
                  <span className="block h-2.5 w-2/3 rounded bg-muted" />
                  <span className="block h-2 w-1/2 rounded bg-muted" />
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Message thread (placeholder) */}
        <div className="flex flex-col rounded-2xl border bg-card">
          <div className="flex flex-1 flex-col items-center justify-center p-10 text-center">
            <h2 className="text-lg font-medium">Messaging coming soon</h2>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              Real-time conversations between team members will appear here.
            </p>
          </div>
          <div className="border-t p-4">
            <div className="flex items-center gap-2 rounded-xl border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
              Type a message…
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
