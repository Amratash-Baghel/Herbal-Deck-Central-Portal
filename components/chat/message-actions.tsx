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
    if (narrow) {
      Object.assign(dialog.style, { left: "12px", right: "12px", bottom: "12px", top: "auto", width: "auto" });
    } else {
      const bounds = dialog.getBoundingClientRect();
      Object.assign(dialog.style, { left: `${Math.max(12, Math.min(rect?.left || 12, window.innerWidth - bounds.width - 12))}px`, right: "auto", bottom: "auto", top: `${Math.max(12, Math.min((rect?.bottom || 12) + 6, window.innerHeight - bounds.height - 12))}px` });
    }
    const cancel = (event: Event) => { event.preventDefault(); close.current(); };
    dialog.addEventListener("cancel", cancel);
    return () => { dialog.removeEventListener("cancel", cancel); dialog.close(); trigger?.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={ref} className="cp-action-menu" aria-label={label} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>{children}</dialog>;
}
