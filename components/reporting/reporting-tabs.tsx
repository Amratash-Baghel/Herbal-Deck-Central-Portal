"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Sub-navigation across the Reporting tools (admins + HR & Management only). */
export function ReportingTabs() {
  const pathname = usePathname();

  const tabs = [
    { href: "/reporting", label: "Team Overview", exact: true },
    { href: "/reporting/attendance", label: "Attendance" },
    { href: "/reporting/eod", label: "EOD Reports" },
    { href: "/reporting/employees", label: "Employee Reviews" },
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
