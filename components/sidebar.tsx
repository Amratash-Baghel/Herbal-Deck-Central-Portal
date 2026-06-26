"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { navItems } from "@/lib/navigation";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { LogoutIcon } from "@/components/icons";
import type { Profile } from "@/lib/types";

function initials(profile: Profile) {
  const source = profile.full_name || profile.email;
  return source
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function Sidebar({ profile }: { profile: Profile }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const visibleItems = navItems.filter(
    (item) => !item.adminOnly || profile.role === "admin",
  );

  return (
    <>
      {/* Mobile top bar */}
      <header className="flex items-center justify-between border-b bg-sidebar px-4 py-3 md:hidden">
        <div className="flex items-center gap-2">
          <Logo className="h-8 w-8" />
          <span className="font-semibold tracking-tight">Herbal Deck</span>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle navigation"
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border"
        >
          <span className="text-lg leading-none">{open ? "✕" : "☰"}</span>
        </button>
      </header>

      <aside
        className={`${open ? "block" : "hidden"} border-b bg-sidebar md:fixed md:inset-y-0 md:left-0 md:block md:w-64 md:border-b-0 md:border-r`}
      >
        <div className="flex h-full flex-col p-4 md:p-5">
          {/* Brand header (desktop) */}
          <div className="mb-6 hidden items-center gap-3 px-2 md:flex">
            <Logo className="h-9 w-9" />
            <div className="leading-tight">
              <p className="font-semibold tracking-tight">Herbal Deck</p>
              <p className="text-xs text-muted-foreground">Employee Portal</p>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex flex-1 flex-col gap-1">
            {visibleItems.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  <Icon className="h-[18px] w-[18px]" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Footer: user, theme, logout */}
          <div className="mt-4 flex flex-col gap-3 border-t pt-4">
            <div className="flex items-center gap-3 px-1">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-foreground">
                {initials(profile)}
              </span>
              <div className="min-w-0 leading-tight">
                <p className="truncate text-sm font-medium">
                  {profile.full_name || profile.email}
                </p>
                <p className="truncate text-xs capitalize text-muted-foreground">
                  {profile.role}
                </p>
              </div>
              <div className="ml-auto">
                <ThemeToggle />
              </div>
            </div>

            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
              >
                <LogoutIcon className="h-[18px] w-[18px]" />
                Log out
              </button>
            </form>
          </div>
        </div>
      </aside>
    </>
  );
}
