"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { createClient } from "@/lib/supabase/client";
import type { Notification } from "@/lib/types";

interface NotificationsContextValue {
  notifications: Notification[];
  unreadCount: number;
  /** Transient popups awaiting display/dismissal. */
  toasts: Notification[];
  markRead: (id: string) => void;
  markAllRead: () => void;
  /** Clear notifications tied to a conversation (called when it's opened). */
  markConversationRead: (conversationId: string) => void;
  dismissToast: (id: string) => void;
  /**
   * The conversation currently on screen, so we don't pop a toast for a message
   * the user is already looking at. Set by the chat client.
   */
  setActiveConversation: (conversationId: string | null) => void;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

/** Read the conversation id a notification points at, if any. */
function conversationOf(n: Notification): string | null {
  const id = n.data?.["conversationId"];
  return typeof id === "string" ? id : null;
}

/**
 * Holds the signed-in user's notifications and the single realtime subscription
 * that keeps them live across the whole portal. New rows raise an in-app toast
 * and bump the bell's unread badge. Wraps the authenticated shell so the bell
 * (in the sidebar) and the toaster (at the layout root) share one source of
 * truth and one websocket.
 */
export function NotificationsProvider({
  userId,
  initial,
  children,
}: {
  userId: string;
  initial: Notification[];
  children: React.ReactNode;
}) {
  const [supabase] = useState(() => createClient());
  const [notifications, setNotifications] = useState<Notification[]>(initial);
  const [toasts, setToasts] = useState<Notification[]>([]);
  const activeConvRef = useRef<string | null>(null);

  const unreadCount = notifications.reduce(
    (n, item) => (item.read_at ? n : n + 1),
    0,
  );

  const markRead = useCallback(
    (id: string) => {
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === id && !n.read_at
            ? { ...n, read_at: new Date().toISOString() }
            : n,
        ),
      );
      void supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", id)
        .is("read_at", null);
    },
    [supabase],
  );

  const markAllRead = useCallback(() => {
    const now = new Date().toISOString();
    setNotifications((prev) =>
      prev.map((n) => (n.read_at ? n : { ...n, read_at: now })),
    );
    void supabase
      .from("notifications")
      .update({ read_at: now })
      .eq("recipient_id", userId)
      .is("read_at", null);
  }, [supabase, userId]);

  const markConversationRead = useCallback(
    (conversationId: string) => {
      setNotifications((prev) => {
        const now = new Date().toISOString();
        let changed = false;
        const next = prev.map((n) => {
          if (!n.read_at && conversationOf(n) === conversationId) {
            changed = true;
            return { ...n, read_at: now };
          }
          return n;
        });
        return changed ? next : prev;
      });
      // Best-effort DB sync: any unread notification for this conversation.
      void supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("recipient_id", userId)
        .is("read_at", null)
        .contains("data", { conversationId });
    },
    [supabase, userId],
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const setActiveConversation = useCallback((conversationId: string | null) => {
    activeConvRef.current = conversationId;
  }, []);

  // Single realtime subscription for this user's notifications.
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    const handleInsert = (n: Notification) => {
      const conv = conversationOf(n);

      // If the user is already viewing the conversation, quietly mark it read
      // instead of interrupting them with a popup.
      if (conv && conv === activeConvRef.current) {
        const read = { ...n, read_at: new Date().toISOString() };
        setNotifications((prev) =>
          prev.some((p) => p.id === n.id) ? prev : [read, ...prev],
        );
        void supabase.from("notifications").update({ read_at: read.read_at }).eq("id", n.id);
        return;
      }

      setNotifications((prev) =>
        prev.some((p) => p.id === n.id) ? prev : [n, ...prev],
      );
      setToasts((prev) => [n, ...prev].slice(0, 4));
    };

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) supabase.realtime.setAuth(data.session.access_token);
      channel = supabase
        .channel(`notifications:${userId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `recipient_id=eq.${userId}`,
          },
          (payload) => handleInsert(payload.new as Notification),
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [supabase, userId]);

  return (
    <NotificationsContext.Provider
      value={{
        notifications,
        unreadCount,
        toasts,
        markRead,
        markAllRead,
        markConversationRead,
        dismissToast,
        setActiveConversation,
      }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}

/** Access the notifications context. Must be used inside NotificationsProvider. */
export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error("useNotifications must be used within NotificationsProvider");
  }
  return ctx;
}
