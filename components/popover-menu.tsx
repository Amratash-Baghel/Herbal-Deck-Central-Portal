"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

/**
 * A dropdown whose menu is rendered in a PORTAL to <body>, positioned with
 * `fixed` under its trigger. This deliberately escapes any transformed / z-index
 * stacking context of an ancestor (e.g. the tilted sticky-note cards, whose
 * `transform` trapped a plain absolute menu behind the cards below it). A
 * full-viewport backdrop closes it on outside click and blocks clicks from
 * bleeding into the content behind. The menu closes on scroll/resize/Escape.
 */
export function PopoverMenu({
  button,
  buttonClassName,
  menuClassName = "",
  width = 192,
  children,
  ariaLabel,
}: {
  button: ReactNode;
  buttonClassName?: string;
  menuClassName?: string;
  width?: number;
  /** Render the menu contents; call `close()` after picking an item. */
  children: (close: () => void) => ReactNode;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  function place() {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    setPos({ top: r.bottom + 4, left });
  }

  function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (open) {
      setOpen(false);
      return;
    }
    place();
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    // Close (rather than chase) on scroll/resize so it never drifts off its anchor.
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        draggable={false}
        onDragStart={(e) => e.stopPropagation()}
        onClick={toggle}
        className={buttonClassName}
      >
        {button}
      </button>

      {open &&
        pos &&
        createPortal(
          <>
            <button
              type="button"
              aria-hidden="true"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
              }}
              className="fixed inset-0 z-[100] cursor-default"
            />
            <div
              role="menu"
              style={{ top: pos.top, left: pos.left, width }}
              onClick={(e) => e.stopPropagation()}
              className={`fixed z-[101] overflow-hidden rounded-xl border bg-card text-foreground shadow-lg ${menuClassName}`}
            >
              {children(() => setOpen(false))}
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
