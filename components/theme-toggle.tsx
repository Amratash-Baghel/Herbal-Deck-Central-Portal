"use client";

import { useState, useSyncExternalStore } from "react";
import { SunIcon, MoonIcon, SparklesIcon, CheckIcon } from "@/components/icons";

/**
 * Theme picker — Light / Dark / Midnight. The source of truth is the class on
 * <html> (`dark` or `midnight`, applied pre-paint by the inline script in the
 * root layout). We read it via useSyncExternalStore so there's no hydration
 * mismatch, then persist changes to localStorage.
 */
type Theme = "light" | "dark" | "midnight";

const OPTIONS: { value: Theme; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "midnight", label: "Midnight" },
];

function subscribe(callback: () => void) {
  window.addEventListener("themechange", callback);
  return () => window.removeEventListener("themechange", callback);
}

function getSnapshot(): Theme {
  const el = document.documentElement;
  if (el.classList.contains("midnight")) return "midnight";
  if (el.classList.contains("dark")) return "dark";
  return "light";
}

function getServerSnapshot(): Theme {
  return "light";
}

function applyTheme(theme: Theme) {
  const el = document.documentElement;
  el.classList.toggle("dark", theme === "dark");
  el.classList.toggle("midnight", theme === "midnight");
  try {
    localStorage.setItem("theme", theme);
  } catch {
    // ignore storage errors (e.g. privacy mode)
  }
  window.dispatchEvent(new Event("themechange"));
}

/** The glyph for a theme. Declared at module scope so React keeps it stable. */
function ThemeGlyph({ theme, className }: { theme: Theme; className?: string }) {
  if (theme === "midnight") return <SparklesIcon className={className} />;
  if (theme === "dark") return <MoonIcon className={className} />;
  return <SunIcon className={className} />;
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
        <ThemeGlyph theme={theme} className="h-4 w-4" />
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
            {OPTIONS.map((o) => {
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
                  <ThemeGlyph theme={o.value} className="h-4 w-4" />
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
