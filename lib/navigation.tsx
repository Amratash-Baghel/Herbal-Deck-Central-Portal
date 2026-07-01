import type { ComponentType, SVGProps } from "react";
import {
  DashboardIcon,
  BillingIcon,
  ChatIcon,
  UsersIcon,
  TasksIcon,
  ReportingIcon,
} from "@/components/icons";

export interface NavItem {
  /** Display label in the sidebar. */
  label: string;
  /** Route the item links to. */
  href: string;
  /** Icon component rendered next to the label. */
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /**
   * When true, the item is only shown to users with staff-management authority
   * (admins or HR & Management).
   */
  managerOnly?: boolean;
}

/**
 * Single source of truth for sidebar navigation. To add a new module to the
 * portal, add an entry here and create the matching page under
 * app/(dashboard)/<route>/page.tsx. The sidebar updates automatically.
 */
export const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: DashboardIcon },
  { label: "Tasks", href: "/tasks", icon: TasksIcon },
  { label: "Billing", href: "/billing", icon: BillingIcon },
  { label: "Chat", href: "/chat", icon: ChatIcon },
  { label: "Reporting", href: "/reporting", icon: ReportingIcon, managerOnly: true },
  { label: "Employee Management", href: "/employees", icon: UsersIcon, managerOnly: true },
];
