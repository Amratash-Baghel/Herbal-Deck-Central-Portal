import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

/**
 * Fetches the raw profile row for the signed-in user (or null), including
 * deactivated accounts — callers decide how to treat that.
 *
 * Wrapped in React's `cache()` so that within a single request/render pass,
 * calling this any number of times — once from the shared dashboard layout,
 * again from a page's `requireProfile()`/`getUserAccess()`, again from a
 * nested component — issues the underlying `auth.getUser()` + `profiles`
 * query exactly ONCE. Without this, every navigation was re-running the same
 * auth check two or three times (layout + page + any extra caller), which was
 * the single biggest contributor to the delay between clicking a link and the
 * next page rendering. This does not cache across requests/users — React's
 * `cache()` scope is one render pass, so every navigation still gets a fresh,
 * fully-verified session check.
 */
const fetchProfileRow = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return (profile as Profile) ?? null;
});

/**
 * Returns the signed-in user's profile, or null if not signed in / no profile.
 * Safe to call from any Server Component.
 */
export async function getProfile(): Promise<Profile | null> {
  const row = await fetchProfileRow();
  // A deactivated (soft-removed) employee has no access.
  if (!row || row.deactivated_at) return null;
  return row;
}

/**
 * Like getProfile, but redirects to /login when there is no signed-in user.
 * Use this to gate every page inside the authenticated app shell.
 */
export async function requireProfile(): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  return profile;
}

/**
 * Ensures the caller is an admin (owner-level: founder / CTO). Redirects
 * employees to the dashboard and signed-out users to login.
 */
export async function requireAdmin(): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.role !== "admin") redirect("/dashboard");
  return profile;
}

/**
 * The signed-in user's resolved access: their profile, which department(s)
 * they belong to, and the derived capabilities used to gate features.
 *
 * Authority over staff and billing belongs to admins OR members of the
 * HR & Management department — mirroring the database's can_manage_* helpers.
 */
export interface UserAccess {
  profile: Profile;
  departmentSlugs: string[];
  departmentIds: string[];
  isAdmin: boolean;
  isHrManagement: boolean;
  /** Department-scoped middle tier (role === 'team_lead'). */
  isTeamLead: boolean;
  /** Add / remove employees, assign roles, clear invoices — admins + HR only. */
  canManageUsers: boolean;
  canManageBilling: boolean;
  /**
   * Access to the Reporting module. Admins + HR see everyone; team leads see
   * only their own department(s) — the pages scope the data accordingly.
   */
  canViewReports: boolean;
  /**
   * Read-only view of a department's invoices. Admins + HR (all) and team leads
   * (their own department[s]). Clearing/rejecting stays with billing managers.
   */
  canViewDeptInvoices: boolean;
}

/** The departments (id + slug) a profile belongs to. Cached per-request. */
const fetchDepartments = cache(
  async (userId: string): Promise<{ id: string; slug: string }[]> => {
    const supabase = await createClient();

    const { data: memberships } = await supabase
      .from("profile_departments")
      .select("departments(id, slug)")
      .eq("profile_id", userId);

    // A foreign-key embed returns a single related row at runtime, though the
    // generated types model it as an array — handle both shapes defensively.
    type DeptRow = { id: string; slug: string };
    const rows = (memberships ?? []) as Array<{
      departments: DeptRow | DeptRow[] | null;
    }>;
    return rows
      .map((m) => {
        const d = m.departments;
        if (!d) return undefined;
        return Array.isArray(d) ? d[0] : d;
      })
      .filter((d): d is DeptRow => Boolean(d));
  },
);

/**
 * Resolves the signed-in user's access. Cached per-request (see
 * `fetchProfileRow` above) — the dashboard layout, individual pages, and any
 * guard (`requireUserManager`, `requireBillingManager`) all share one result.
 */
export const getUserAccess = cache(async (): Promise<UserAccess | null> => {
  const row = await fetchProfileRow();
  if (!row || row.deactivated_at) return null;
  const profile = row;

  const departments = await fetchDepartments(profile.id);
  const departmentSlugs = departments.map((d) => d.slug);
  const departmentIds = departments.map((d) => d.id);

  const isAdmin = profile.role === "admin";
  const isTeamLead = profile.role === "team_lead";
  // HR & Management authority comes from the ROLE or from department membership.
  const isHrManagement =
    profile.role === "hr_management" || departmentSlugs.includes("hr-management");
  const canManage = isAdmin || isHrManagement;

  return {
    profile,
    departmentSlugs,
    departmentIds,
    isAdmin,
    isHrManagement,
    isTeamLead,
    canManageUsers: canManage,
    canManageBilling: canManage,
    canViewReports: canManage || isTeamLead,
    canViewDeptInvoices: canManage || isTeamLead,
  };
});

/**
 * Gates pages/actions that require staff- or billing-management authority
 * (admins or HR & Management). Employees are sent to the dashboard.
 */
export async function requireUserManager(): Promise<UserAccess> {
  const access = await getUserAccess();
  if (!access) redirect("/login");
  if (!access.canManageUsers) redirect("/dashboard");
  return access;
}

/**
 * Gates pages/actions that require billing authority (admins or HR &
 * Management) — clearing/rejecting invoices and uploading signed copies.
 * Everyone else is sent to the dashboard.
 */
export async function requireBillingManager(): Promise<UserAccess> {
  const access = await getUserAccess();
  if (!access) redirect("/login");
  if (!access.canManageBilling) redirect("/dashboard");
  return access;
}

/**
 * Gates the Reporting module — admins, HR & Management, and team leads. Team
 * leads see only their own department(s); the pages scope the data. Everyone
 * else is sent to the dashboard.
 */
export async function requireReportViewer(): Promise<UserAccess> {
  const access = await getUserAccess();
  if (!access) redirect("/login");
  if (!access.canViewReports) redirect("/dashboard");
  return access;
}
