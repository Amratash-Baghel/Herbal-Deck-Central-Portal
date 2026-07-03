"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Sub-navigation across the billing tools. "Clear", "Analytics", and "Petty
 * Cash" only appear for billing managers (admins + HR & Management).
 */
export function BillingTabs({
  canClear,
  canViewDeptInvoices,
}: {
  canClear: boolean;
  canViewDeptInvoices: boolean;
}) {
  const pathname = usePathname();

  const tabs = [
    { href: "/billing", label: "Overview", exact: true },
    { href: "/billing/generate", label: "Generate" },
    { href: "/billing/post", label: "Post" },
    // Team leads (and managers) get the read-only department invoice view.
    ...(canViewDeptInvoices
      ? [{ href: "/billing/department", label: "Department" }]
      : []),
    ...(canClear
      ? [
          { href: "/billing/clearing", label: "Clear" },
          { href: "/billing/analytics", label: "Analytics" },
          { href: "/billing/petty-cash", label: "Petty Cash" },
        ]
      : []),
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
