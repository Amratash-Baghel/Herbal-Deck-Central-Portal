"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useTitleBadge } from "@/components/notifications/use-title-badge";
import {
  desktopPermission,
  portalIsFocused,
  requestDesktopPermission,
  showDesktopNotification,
  type DesktopPermission,
} from "@/lib/desktop-notifications";
import {
  playNotificationChime,
  primeNotificationSound,
  setSoundMuted,
  soundMuted,
} from "@/lib/notification-sound";
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
  /** Browser permission for OS-level popups when the portal isn't focused. */
  desktopPermission: DesktopPermission;
  /** Prompt for that permission. Call from a click — Safari requires a gesture. */
  enableDesktopNotifications: () => void;
  /** Whether the arrival chime is silenced on this browser. */
  soundMuted: boolean;
  toggleSound: () => void;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

/** Read the conversation id a notification points at, if any. */
function conversationOf(n: Notification): string | null {
  const id = n.data?.["conversationId"];
  return typeof id === "string" ? id : null;
}

/**
 * Fire a Supabase query builder and forget it. Builders are lazy — the request
 * is only sent when the thenable is subscribed — so we must call `.then()`;
 * merely referencing (or `void`-ing) the builder never hits the network.
 */
function run(query: PromiseLike<unknown>): void {
  query.then(
    () => {},
    () => {},
  );
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
  const router = useRouter();
  const routerRef = useRef(router);

  // Reads "unsupported" on the server, where there is no Notification API.
  // Safe against hydration: the only permission-dependent UI lives in the
  // bell's panel, which is closed until the user opens it.
  const [permission, setPermission] =
    useState<DesktopPermission>(desktopPermission);

  const unreadCount = notifications.reduce(
    (n, item) => (item.read_at ? n : n + 1),
    0,
  );

  useTitleBadge(unreadCount);

  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  const enableDesktopNotifications = useCallback(() => {
    void requestDesktopPermission().then(setPermission);
  }, []);

  const [muted, setMuted] = useState(soundMuted);

  const toggleSound = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      setSoundMuted(next);
      // Unmuting is itself a click, so it doubles as the gesture that unlocks
      // audio — and the preview confirms the chime is actually audible.
      if (!next) playNotificationChime();
      return next;
    });
  }, []);

  // An AudioContext is born suspended until the page sees a gesture.
  useEffect(() => {
    const prime = () => primeNotificationSound();
    window.addEventListener("pointerdown", prime, { once: true });
    window.addEventListener("keydown", prime, { once: true });
    return () => {
      window.removeEventListener("pointerdown", prime);
      window.removeEventListener("keydown", prime);
    };
  }, []);

  const markRead = useCallback(
    (id: string) => {
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === id && !n.read_at
            ? { ...n, read_at: new Date().toISOString() }
            : n,
        ),
      );
      run(
        supabase
          .from("notifications")
          .update({ read_at: new Date().toISOString() })
          .eq("id", id)
          .is("read_at", null),
      );
    },
    [supabase],
  );

  const markAllRead = useCallback(() => {
    const now = new Date().toISOString();
    setNotifications((prev) =>
      prev.map((n) => (n.read_at ? n : { ...n, read_at: now })),
    );
    run(
      supabase
        .from("notifications")
        .update({ read_at: now })
        .eq("recipient_id", userId)
        .is("read_at", null),
    );
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
      run(
        supabase
          .from("notifications")
          .update({ read_at: new Date().toISOString() })
          .eq("recipient_id", userId)
          .is("read_at", null)
          .contains("data", { conversationId }),
      );
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
      const focused = portalIsFocused();

      // If the user is already viewing the conversation, quietly mark it read
      // instead of interrupting them with a popup. Only when the portal is
      // actually focused, though — a thread left open in a background tab is
      // just as unseen as any other, and must still raise an alert.
      if (conv && conv === activeConvRef.current && focused) {
        const read = { ...n, read_at: new Date().toISOString() };
        setNotifications((prev) =>
          prev.some((p) => p.id === n.id) ? prev : [read, ...prev],
        );
        run(supabase.from("notifications").update({ read_at: read.read_at }).eq("id", n.id));
        return;
      }

      setNotifications((prev) =>
        prev.some((p) => p.id === n.id) ? prev : [n, ...prev],
      );
      setToasts((prev) => [n, ...prev].slice(0, 4));
      playNotificationChime();

      // The in-app banner is invisible from another tab, so hand the alert to
      // the OS instead.
      if (!focused) {
        showDesktopNotification(n, () => {
          if (n.link) routerRef.current.push(n.link);
        });
      }
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
        desktopPermission: permission,
        enableDesktopNotifications,
        soundMuted: muted,
        toggleSound,
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
