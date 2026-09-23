"use client";

import { useState, useSyncExternalStore } from "react";
import { CheckIcon } from "@/components/icons";
import { THEMES, type Theme } from "@/lib/themes";

/**
 * Theme picker. The source of truth is the class on <html> (applied pre-paint
 * by the inline script in the root layout). We read it via useSyncExternalStore
 * so there's no hydration mismatch, then persist changes to localStorage.
 *
 * Six themes is too many for one glyph each, so each is shown as a swatch pair:
 * its ground and its brand colour, which is what actually distinguishes them.
 */
function subscribe(callback: () => void) {
  window.addEventListener("themechange", callback);
  return () => window.removeEventListener("themechange", callback);
}

function getSnapshot(): Theme {
  const list = document.documentElement.classList;
  return THEMES.find((t) => t.className && list.contains(t.className))?.value ?? "paper";
}

function getServerSnapshot(): Theme {
  return "paper";
}

function applyTheme(theme: Theme) {
  const el = document.documentElement;
  for (const t of THEMES) {
    if (t.className) el.classList.toggle(t.className, t.value === theme);
  }
  try {
    localStorage.setItem("theme", theme);
  } catch {
    // ignore storage errors (e.g. privacy mode)
  }
  window.dispatchEvent(new Event("themechange"));
}

/** A theme as a two-tone chip: its page ground, with its brand colour inset. */
function ThemeSwatch({ theme, className = "" }: { theme: Theme; className?: string }) {
  const t = THEMES.find((x) => x.value === theme) ?? THEMES[0];
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-4 w-4 shrink-0 rounded-full border border-foreground/20 ${className}`}
      style={{ background: `linear-gradient(135deg, ${t.ground} 50%, ${t.brand} 50%)` }}
    />
  );
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Change theme"
        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border text-muted-foreground transition hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ThemeSwatch theme={theme} />
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="absolute bottom-full right-0 z-50 mb-2 w-40 rounded-xl border bg-card p-1 shadow-lg">
            {THEMES.map((o) => {
              const active = o.value === theme;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => {
                    applyTheme(o.value);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition hover:bg-accent ${
                    active ? "text-primary" : "text-foreground"
                  }`}
                >
                  <ThemeSwatch theme={o.value} />
                  <span className="flex-1 text-left">{o.label}</span>
                  {active && <CheckIcon className="h-3.5 w-3.5" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
