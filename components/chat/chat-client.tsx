"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { useNotifications } from "@/components/notifications/notifications-provider";
import { MessageComposer } from "@/components/chat/message-composer";
import { NewConversationDialog } from "@/components/chat/new-conversation-dialog";
import { GroupSettingsDialog } from "@/components/chat/group-settings-dialog";
import { sendMessage } from "@/app/(dashboard)/chat/actions";
import { PlusIcon, GroupIcon, SettingsIcon, ChatIcon } from "@/components/icons";
import { timeAgo, formatClock, dayLabel } from "@/lib/time";
import type { Message } from "@/lib/types";
import type { DirectoryEntry, ConversationSummary } from "@/components/chat/types";

function initials(name: string): string {
  return name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function sortConvs(list: ConversationSummary[]): ConversationSummary[] {
  return [...list].sort((a, b) => {
    const at = a.lastMessageAt ? Date.parse(a.lastMessageAt) : 0;
    const bt = b.lastMessageAt ? Date.parse(b.lastMessageAt) : 0;
    return bt - at;
  });
}

/** Render a message body, highlighting the @mentions it actually pinged. */
function renderBody(body: string, mentionNames: string[]) {
  if (mentionNames.length === 0) return body;
  const escaped = mentionNames
    .slice()
    .sort((a, b) => b.length - a.length)
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`@(?:${escaped.join("|")})`, "g");
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(body)) !== null) {
    if (m.index > last) out.push(body.slice(last, m.index));
    out.push(
      <span key={`m${i++}`} className="rounded bg-accent px-1 font-medium text-primary">
        {m[0]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < body.length) out.push(body.slice(last));
  return out;
}

/**
 * The chat experience: a conversation list beside a live message thread.
 *
 * Realtime is driven by a SINGLE subscription to message inserts — RLS scopes it
 * to the user's conversations, so one stream powers the open thread, the unread
 * badges, conversation re-ordering, and even surfacing a brand-new DM or group
 * the moment its first message arrives. Cross-page pings (new DMs, @mentions)
 * ride the separate notifications stream owned by NotificationsProvider.
 */
export function ChatClient({
  me,
  directory,
  conversations: initialConversations,
  initialConversationId,
}: {
  me: { id: string; name: string };
  directory: DirectoryEntry[];
  conversations: ConversationSummary[];
  initialConversationId?: string;
}) {
  const meId = me.id;
  const [supabase] = useState(() => createClient());
  const { markConversationRead, setActiveConversation } = useNotifications();

  const [conversations, setConversations] = useState(() =>
    sortConvs(initialConversations),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const convsRef = useRef(conversations);
  const selectedIdRef = useRef<string | null>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    convsRef.current = conversations;
  }, [conversations]);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const nameOf = useMemo(() => {
    const map = new Map(directory.map((d) => [d.id, d.name]));
    return (id: string) => map.get(id) ?? "Unknown";
  }, [directory]);

  const titleOf = useCallback(
    (c: ConversationSummary) => {
      if (c.type === "group") return c.name || "Group";
      const other = c.participantIds.find((id) => id !== meId);
      return other ? nameOf(other) : "Direct message";
    },
    [meId, nameOf],
  );

  const refreshConversation = useCallback(
    async (id: string, opts?: { bumpUnread?: boolean }) => {
      const { data: c } = await supabase
        .from("conversations")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (!c) {
        setConversations((prev) => prev.filter((x) => x.id !== id));
        return;
      }
      const { data: parts } = await supabase
        .from("conversation_participants")
        .select("profile_id, is_admin")
        .eq("conversation_id", id);
      const participantIds = (parts ?? []).map((p) => p.profile_id as string);
      const amAdmin = (parts ?? []).some(
        (p) => p.profile_id === meId && p.is_admin,
      );
      setConversations((prev) => {
        const existing = prev.find((x) => x.id === id);
        const selected = selectedIdRef.current === id;
        const unread = selected
          ? 0
          : (existing?.unread ?? 0) + (opts?.bumpUnread ? 1 : 0);
        const summary: ConversationSummary = {
          id,
          type: c.type,
          name: c.name,
          participantIds,
          amAdmin,
          unread,
          lastMessageAt: c.last_message_at,
          lastMessagePreview: c.last_message_preview,
        };
        return sortConvs([summary, ...prev.filter((x) => x.id !== id)]);
      });
    },
    [supabase, meId],
  );

  const select = useCallback(
    async (id: string) => {
      if (!convsRef.current.some((c) => c.id === id)) {
        await refreshConversation(id);
      }
      setSelectedId(id);
      selectedIdRef.current = id;
      setActiveConversation(id);
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", `/chat?c=${id}`);
      }
      markConversationRead(id);
      supabase.rpc("mark_conversation_read", { conv_id: id }).then(
        () => {},
        () => {},
      );
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, unread: 0 } : c)),
      );

      setLoadingMessages(true);
      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", id)
        .order("created_at", { ascending: true })
        .limit(300);
      setMessages((data ?? []) as Message[]);
      setLoadingMessages(false);
    },
    [supabase, refreshConversation, markConversationRead, setActiveConversation],
  );

  const backToList = useCallback(() => {
    setSelectedId(null);
    selectedIdRef.current = null;
    setActiveConversation(null);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", "/chat");
    }
  }, [setActiveConversation]);

  // Stable handler for the realtime stream (kept in a ref so the subscription
  // mounts once and never re-subscribes).
  const handleIncoming = useCallback(
    (m: Message) => {
      const selected = selectedIdRef.current === m.conversation_id;
      if (selected) {
        setMessages((prev) =>
          prev.some((x) => x.id === m.id) ? prev : [...prev, m],
        );
        markConversationRead(m.conversation_id);
        supabase.rpc("mark_conversation_read", { conv_id: m.conversation_id }).then(
          () => {},
          () => {},
        );
      }

      if (!convsRef.current.some((c) => c.id === m.conversation_id)) {
        void refreshConversation(m.conversation_id, {
          bumpUnread: !selected && m.sender_id !== meId,
        });
        return;
      }

      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === m.conversation_id);
        if (idx === -1) return prev;
        const c = prev[idx];
        const unread = selected
          ? 0
          : m.sender_id !== meId
            ? c.unread + 1
            : c.unread;
        const updated: ConversationSummary = {
          ...c,
          lastMessageAt: m.created_at,
          lastMessagePreview: m.body.slice(0, 140),
          unread,
        };
        return [updated, ...prev.filter((_, i) => i !== idx)];
      });
    },
    [supabase, refreshConversation, markConversationRead, meId],
  );

  const handlerRef = useRef(handleIncoming);
  useEffect(() => {
    handlerRef.current = handleIncoming;
  }, [handleIncoming]);

  // One realtime subscription for all of the user's messages.
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) supabase.realtime.setAuth(data.session.access_token);
      channel = supabase
        .channel("chat-messages")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages" },
          (payload) => handlerRef.current(payload.new as Message),
        )
        .subscribe();
    })();
    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [supabase]);

  // Initial deep-link selection (e.g. arriving from a notification). Deferred to
  // a microtask so the selection (which updates state) runs after mount rather
  // than synchronously inside the effect.
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    if (initialConversationId) {
      queueMicrotask(() => void select(initialConversationId));
    }
  }, [initialConversationId, select]);

  // Keep the thread pinned to the latest message.
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages, selectedId]);

  // Release the "active conversation" marker when unmounting the page.
  useEffect(() => {
    return () => setActiveConversation(null);
  }, [setActiveConversation]);

  const handleSend = useCallback(
    async (body: string, mentionIds: string[]) => {
      const id = selectedIdRef.current;
      if (!id) return { ok: false, error: "No conversation selected." };
      const res = await sendMessage(id, body, mentionIds);
      if (res.ok && res.message) {
        const msg = res.message;
        setMessages((prev) =>
          prev.some((x) => x.id === msg.id) ? prev : [...prev, msg],
        );
        setConversations((prev) => {
          const idx = prev.findIndex((c) => c.id === id);
          if (idx === -1) return prev;
          const c = prev[idx];
          const updated: ConversationSummary = {
            ...c,
            lastMessageAt: msg.created_at,
            lastMessagePreview: body.slice(0, 140),
            unread: 0,
          };
          return [updated, ...prev.filter((_, i) => i !== idx)];
        });
      }
      return res;
    },
    [],
  );

  const selectedConv = conversations.find((c) => c.id === selectedId) ?? null;
  const composerParticipants = useMemo(
    () =>
      selectedConv
        ? selectedConv.participantIds
            .filter((id) => id !== meId)
            .map((id) => ({ id, name: nameOf(id) }))
        : [],
    [selectedConv, meId, nameOf],
  );

  return (
    <>
      <div className="grid h-[calc(100vh-14rem)] min-h-[460px] grid-cols-1 gap-5 md:grid-cols-[300px_1fr]">
        {/* Conversation list */}
        <div
          className={`${
            selectedId ? "hidden md:flex" : "flex"
          } flex-col overflow-hidden rounded-2xl border bg-card`}
        >
          <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Conversations
            </p>
            <button
              type="button"
              onClick={() => setShowNew(true)}
              className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground shadow-sm transition hover:opacity-90"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              New
            </button>
          </div>

          <ul className="flex-1 overflow-y-auto">
            {conversations.length === 0 && (
              <li className="px-4 py-10 text-center text-sm text-muted-foreground">
                No conversations yet. Start one with “New”.
              </li>
            )}
            {conversations.map((c) => {
              const active = c.id === selectedId;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => void select(c.id)}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left transition ${
                      active ? "bg-accent" : "hover:bg-accent/60"
                    }`}
                  >
                    <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-primary">
                      {c.type === "group" ? (
                        <GroupIcon className="h-5 w-5" />
                      ) : (
                        initials(titleOf(c))
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">
                          {titleOf(c)}
                        </span>
                        {c.lastMessageAt && (
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            {timeAgo(c.lastMessageAt)}
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 flex items-center justify-between gap-2">
                        <span className="truncate text-xs text-muted-foreground">
                          {c.lastMessagePreview || "No messages yet"}
                        </span>
                        {c.unread > 0 && (
                          <span className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                            {c.unread > 9 ? "9+" : c.unread}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Message thread */}
        <div
          className={`${
            selectedId ? "flex" : "hidden md:flex"
          } flex-col overflow-hidden rounded-2xl border bg-card`}
        >
          {!selectedConv ? (
            <div className="flex flex-1 flex-col items-center justify-center p-10 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-primary dark:text-ring">
                <ChatIcon className="h-6 w-6" />
              </span>
              <h2 className="mt-3 text-lg font-medium">Select a conversation</h2>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Pick a chat on the left, or start a new direct message or group.
              </p>
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div className="flex items-center gap-3 border-b px-4 py-3">
                <button
                  type="button"
                  onClick={backToList}
                  className="-ml-1 inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent md:hidden"
                  aria-label="Back to conversations"
                >
                  ←
                </button>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-primary">
                  {selectedConv.type === "group" ? (
                    <GroupIcon className="h-5 w-5" />
                  ) : (
                    initials(titleOf(selectedConv))
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {titleOf(selectedConv)}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {selectedConv.type === "group"
                      ? `${selectedConv.participantIds.length} members`
                      : "Direct message"}
                  </p>
                </div>
                {selectedConv.type === "group" && (
                  <button
                    type="button"
                    onClick={() => setShowSettings(true)}
                    aria-label="Group settings"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-accent hover:text-foreground"
                  >
                    <SettingsIcon className="h-[18px] w-[18px]" />
                  </button>
                )}
              </div>

              {/* Messages */}
              <div className="flex-1 space-y-1 overflow-y-auto px-4 py-4">
                {loadingMessages && (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    Loading…
                  </p>
                )}
                {!loadingMessages && messages.length === 0 && (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No messages yet — say hello.
                  </p>
                )}
                {messages.map((m, i) => {
                  const mine = m.sender_id === meId;
                  const prev = messages[i - 1];
                  const showDay =
                    !prev ||
                    dayLabel(prev.created_at) !== dayLabel(m.created_at);
                  const showSender =
                    selectedConv.type === "group" &&
                    !mine &&
                    (!prev || prev.sender_id !== m.sender_id || showDay);
                  const mentionNames = m.mentions.map(nameOf);
                  return (
                    <Fragment key={m.id}>
                      {showDay && (
                        <div className="my-3 flex items-center justify-center">
                          <span className="rounded-full bg-muted px-3 py-0.5 text-[11px] font-medium text-muted-foreground">
                            {dayLabel(m.created_at)}
                          </span>
                        </div>
                      )}
                      <div
                        className={`flex flex-col ${mine ? "items-end" : "items-start"}`}
                      >
                        {showSender && (
                          <span className="mb-0.5 ml-1 text-[11px] font-medium text-muted-foreground">
                            {nameOf(m.sender_id)}
                          </span>
                        )}
                        <div
                          className={`max-w-[78%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${
                            mine
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-foreground"
                          }`}
                        >
                          {renderBody(m.body, mentionNames)}
                          <span
                            className={`ml-2 inline-block translate-y-0.5 text-[10px] ${
                              mine
                                ? "text-primary-foreground/70"
                                : "text-muted-foreground"
                            }`}
                          >
                            {formatClock(m.created_at)}
                          </span>
                        </div>
                      </div>
                    </Fragment>
                  );
                })}
                <div ref={threadEndRef} />
              </div>

              <MessageComposer
                participants={composerParticipants}
                onSend={handleSend}
              />
            </>
          )}
        </div>
      </div>

      {showNew && (
        <NewConversationDialog
          meId={meId}
          directory={directory}
          onClose={() => setShowNew(false)}
          onOpenConversation={(id) => void select(id)}
        />
      )}

      {showSettings && selectedConv && selectedConv.type === "group" && (
        <GroupSettingsDialog
          conversation={selectedConv}
          directory={directory}
          meId={meId}
          onClose={() => setShowSettings(false)}
          onChanged={() => void refreshConversation(selectedConv.id)}
          onLeft={() => {
            setShowSettings(false);
            const id = selectedConv.id;
            setConversations((prev) => prev.filter((c) => c.id !== id));
            backToList();
          }}
        />
      )}
    </>
  );
}
