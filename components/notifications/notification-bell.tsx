"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useNotifications } from "@/components/notifications/notifications-provider";
import { NotificationTypeIcon } from "@/components/notifications/notification-icon";
import { BellIcon } from "@/components/icons";
import { timeAgo } from "@/lib/time";
import type { Notification } from "@/lib/types";

/**
 * The notification bell: an unread badge plus a dropdown of recent items.
 * Clicking an item marks it read and navigates to wherever it points (a chat
 * thread, the clearing queue, …). Rendered inside the sidebar; the panel is
 * positioned to sit beside the sidebar on desktop and as a sheet on mobile.
 */
export function NotificationBell() {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const recent = notifications.slice(0, 20);

  function open_(n: Notification) {
    markRead(n.id);
    setOpen(false);
    if (n.link) router.push(n.link);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-accent hover:text-foreground"
      >
        <BellIcon className="h-[18px] w-[18px]" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Click-away backdrop */}
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="fixed left-3 right-3 top-16 z-50 w-auto rounded-2xl border bg-card shadow-lg md:left-[17rem] md:right-auto md:top-4 md:w-96">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <p className="text-sm font-semibold tracking-tight">Notifications</p>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="text-xs font-medium text-primary transition hover:underline"
                >
                  Mark all read
                </button>
              )}
            </div>

            <ul className="max-h-[60vh] divide-y overflow-y-auto md:max-h-[28rem]">
              {recent.length === 0 && (
                <li className="px-4 py-10 text-center text-sm text-muted-foreground">
                  You&apos;re all caught up.
                </li>
              )}
              {recent.map((n) => {
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => open_(n)}
                      className={`flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-accent ${
                        n.read_at ? "opacity-70" : ""
                      }`}
                    >
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
                        <NotificationTypeIcon type={n.type} className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">
                            {n.title}
                          </span>
                          {!n.read_at && (
                            <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                          )}
                        </span>
                        {n.body && (
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                            {n.body}
                          </span>
                        )}
                        <span className="mt-0.5 block text-[11px] text-muted-foreground">
                          {timeAgo(n.created_at)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
