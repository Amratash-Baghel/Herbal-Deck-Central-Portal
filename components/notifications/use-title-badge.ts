"use client";

import { useEffect } from "react";

/** Matches a badge this hook wrote, e.g. "(3) " or "(9+) ". */
const BADGE = /^\(\d+\+?\)\s+/;

/**
 * Prefixes the tab title with the unread count, so a background tab shows
 * "(3) Herbal Deck Portal" in the browser's tab strip. Someone working in
 * another tab sees the count without the portal having to be on screen.
 */
export function useTitleBadge(count: number): void {
  useEffect(() => {
    const el = document.querySelector("title");
    if (!el) return;

    const label = count > 9 ? "9+" : String(count);

    const apply = () => {
      const bare = (el.textContent ?? "").replace(BADGE, "");
      const next = count > 0 ? `(${label}) ${bare}` : bare;
      // Idempotent, so re-entering from our own mutation settles immediately.
      if (el.textContent !== next) el.textContent = next;
    };

    apply();

    // Next rewrites <title> from route metadata on every navigation, which
    // would otherwise drop the badge until the next unread change.
    const observer = new MutationObserver(apply);
    observer.observe(el, { childList: true, characterData: true, subtree: true });

    return () => {
      observer.disconnect();
      el.textContent = (el.textContent ?? "").replace(BADGE, "");
    };
  }, [count]);
}
