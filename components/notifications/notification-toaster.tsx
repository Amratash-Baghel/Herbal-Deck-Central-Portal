"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useNotifications } from "@/components/notifications/notifications-provider";
import { NotificationTypeIcon } from "@/components/notifications/notification-icon";
import type { Notification } from "@/lib/types";

const TOAST_MS = 6000;
/** Upward drag past this many pixels flicks the banner away. */
const SWIPE_PX = 40;
/** Long enough for the leave transition below to finish. */
const LEAVE_MS = 220;

/**
 * Stacked, auto-dismissing banners for incoming notifications, modelled on the
 * iOS heads-up banner: they drop in at the top of the screen, sit on a frosted
 * translucent card, and can be flicked upwards to dismiss. Fed by the
 * NotificationsProvider's realtime subscription; tapping one opens its target.
 */
export function NotificationToaster() {
  const { toasts, dismissToast, markRead } = useNotifications();
  const router = useRouter();

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-3">
      {toasts.map((t) => (
        <Banner
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

function Banner({
  toast,
  onDismiss,
  onOpen,
}: {
  toast: Notification;
  onDismiss: () => void;
  onOpen: () => void;
}) {
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const startY = useRef<number | null>(null);
  // Set once a drag passes the slop threshold, so releasing after a swipe
  // doesn't also register as a tap on the banner.
  const moved = useRef(false);

  const close = useCallback(() => {
    setLeaving(true);
    window.setTimeout(onDismiss, LEAVE_MS);
  }, [onDismiss]);

  useEffect(() => {
    const handle = setTimeout(close, TOAST_MS);
    return () => clearTimeout(handle);
    // Dismiss timer is set once per banner.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    startY.current = e.clientY;
    moved.current = false;
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (startY.current === null) return;
    const dy = e.clientY - startY.current;
    if (Math.abs(dy) > 4) moved.current = true;
    // Upward travel is free; downward resists, as the banner has nowhere to go.
    setDrag(dy < 0 ? dy : Math.min(dy * 0.3, 18));
  };

  const endDrag = () => {
    if (startY.current === null) return;
    startY.current = null;
    setDragging(false);
    if (drag < -SWIPE_PX) close();
    else setDrag(0);
  };

  return (
    <div className="animate-banner-in pointer-events-auto w-full max-w-[26rem]">
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={{
          transform: `translateY(${leaving ? -180 : drag}px)`,
          opacity: leaving ? 0 : 1,
          transition: dragging
            ? "none"
            : `transform ${LEAVE_MS}ms cubic-bezier(0.32, 0.72, 0, 1), opacity ${LEAVE_MS}ms ease`,
          touchAction: "none",
        }}
        className="overflow-hidden rounded-[1.4rem] border border-border/70 bg-card/80 shadow-[0_10px_34px_-6px_rgba(0,0,0,0.28)] backdrop-blur-xl backdrop-saturate-150"
      >
        <button
          type="button"
          onClick={() => {
            if (moved.current) return;
            onOpen();
          }}
          className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition active:scale-[0.985]"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.7rem] bg-primary text-primary-foreground">
            <NotificationTypeIcon type={toast.type} className="h-[18px] w-[18px]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold tracking-tight">
              {toast.title}
            </span>
            {toast.body && (
              <span className="mt-0.5 block line-clamp-2 text-xs text-muted-foreground">
                {toast.body}
              </span>
            )}
          </span>
        </button>
        {/* The iOS grabber, hinting that the banner can be flicked away. */}
        <span className="mx-auto mb-1.5 block h-1 w-9 rounded-full bg-muted-foreground/30" />
      </div>
    </div>
  );
}
