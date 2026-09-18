"use client";

import type { Notification as PortalNotification } from "@/lib/types";

/**
 * Thin wrapper around the browser's Notification API, used to surface portal
 * notifications when the tab isn't the one the user is looking at. The in-app
 * toaster only helps someone already staring at the portal; these popups are
 * drawn by the operating system, so they land even when the window is
 * minimised or buried behind another tab.
 */

export type DesktopPermission = "unsupported" | "default" | "granted" | "denied";

/** Current permission, or "unsupported" where the API doesn't exist at all. */
export function desktopPermission(): DesktopPermission {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return window.Notification.permission;
}

/**
 * True when the portal is both on screen and focused. A background tab, a
 * minimised window, and a window sitting behind another app all read false —
 * those are exactly the cases where an in-app toast goes unseen.
 */
export function portalIsFocused(): boolean {
  if (typeof document === "undefined") return true;
  return document.visibilityState === "visible" && document.hasFocus();
}

/** Prompt for permission. Must be called from a user gesture (Safari enforces this). */
export async function requestDesktopPermission(): Promise<DesktopPermission> {
  if (desktopPermission() === "unsupported") return "unsupported";
  try {
    return await window.Notification.requestPermission();
  } catch {
    return window.Notification.permission;
  }
}

/**
 * Raise an OS-level popup for a notification. Clicking it refocuses the portal
 * and runs `onOpen` (which navigates to the notification's target).
 */
export function showDesktopNotification(
  n: PortalNotification,
  onOpen: () => void,
): void {
  if (desktopPermission() !== "granted") return;

  try {
    const popup = new window.Notification(n.title, {
      body: n.body || undefined,
      // Re-delivery of the same row replaces the popup instead of stacking.
      tag: n.id,
    });
    popup.onclick = () => {
      window.focus();
      popup.close();
      onOpen();
    };
  } catch {
    // Android Chrome forbids the constructor outside a service worker; there
    // the in-app toast and title badge remain the fallback.
  }
}
