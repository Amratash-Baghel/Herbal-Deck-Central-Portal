"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Native modal behaviour gives the action sheet focus containment and Escape. */
export function MessageActionPopover({ children, onClose, label = "Message actions" }: { children: ReactNode; onClose: () => void; label?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const trigger = document.activeElement as HTMLElement | null;
    const rect = trigger?.getBoundingClientRect();
    const narrow = (trigger?.closest(".cp-workspace")?.getBoundingClientRect().width || window.innerWidth) < 680;
    dialog.showModal();
    /** Re-run on every size change: content that loads late (GIF results, emoji
     *  grid) grows the sheet after it opens and would otherwise run off-screen. */
    const place = () => {
      if (narrow) {
        Object.assign(dialog.style, { left: "12px", right: "12px", bottom: "12px", top: "auto", width: "auto" });
        return;
      }
      const bounds = dialog.getBoundingClientRect();
      const below = (rect?.bottom || 12) + 6;
      const above = (rect?.top || 0) - bounds.height - 6;
      // Prefer below the trigger; flip above when it would overflow and there's room.
      const top = below + bounds.height + 12 <= window.innerHeight ? below : above >= 12 ? above : Math.max(12, window.innerHeight - bounds.height - 12);
      Object.assign(dialog.style, { left: `${Math.max(12, Math.min(rect?.left || 12, window.innerWidth - bounds.width - 12))}px`, right: "auto", bottom: "auto", top: `${top}px` });
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(dialog);
    const cancel = (event: Event) => { event.preventDefault(); close.current(); };
    dialog.addEventListener("cancel", cancel);
    window.addEventListener("resize", place);
    return () => { observer.disconnect(); window.removeEventListener("resize", place); dialog.removeEventListener("cancel", cancel); dialog.close(); trigger?.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={ref} className="cp-action-menu" aria-label={label} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>{children}</dialog>;
}
