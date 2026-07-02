"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useNotifications } from "@/components/notifications/notifications-provider";
import { NotificationTypeIcon } from "@/components/notifications/notification-icon";
import { CloseIcon } from "@/components/icons";
import type { Notification } from "@/lib/types";

const TOAST_MS = 6000;

/**
 * Stacked, auto-dismissing popups for incoming notifications. Fed by the
 * NotificationsProvider's realtime subscription; clicking a toast opens its
 * target. Anchored bottom-right so it never collides with the bell's panel.
 */
export function NotificationToaster() {
  const { toasts, dismissToast, markRead } = useNotifications();
  const router = useRouter();

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2">
      {toasts.map((t) => (
        <Toast
          key={t.id}
          toast={t}
          onDismiss={() => dismissToast(t.id)}
          onOpen={() => {
            markRead(t.id);
            dismissToast(t.id);
            if (t.link) router.push(t.link);
          }}
        />
      ))}
    </div>
  );
}

function Toast({
  toast,
  onDismiss,
  onOpen,
}: {
  toast: Notification;
  onDismiss: () => void;
  onOpen: () => void;
}) {
  useEffect(() => {
    const handle = setTimeout(onDismiss, TOAST_MS);
    return () => clearTimeout(handle);
    // Dismiss timer is set once per toast.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="pointer-events-auto overflow-hidden rounded-2xl border bg-card shadow-lg">
      <div className="flex items-start gap-3 p-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-primary dark:text-ring">
          <NotificationTypeIcon type={toast.type} className="h-[18px] w-[18px]" />
        </span>
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <p className="truncate text-sm font-medium">{toast.title}</p>
          {toast.body && (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
              {toast.body}
            </p>
          )}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
