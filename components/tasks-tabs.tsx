"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Sub-navigation across the Tasks & Reporting tools. The "Manage" tab (the
 * all-departments dashboard) only appears for admins + HR & Management.
 */
export function TasksTabs({ canManage }: { canManage: boolean }) {
  const pathname = usePathname();

  const tabs = [
    { href: "/tasks", label: "My Board", exact: true },
    { href: "/tasks/team", label: "Team" },
    { href: "/tasks/reports", label: "Reports" },
    ...(canManage ? [{ href: "/tasks/manage", label: "Manage" }] : []),
  ];

  return (
    <nav className="mb-6 flex flex-wrap gap-1 border-b">
      {tabs.map((tab) => {
        const active = tab.exact
          ? pathname === tab.href
          : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${
              active
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
