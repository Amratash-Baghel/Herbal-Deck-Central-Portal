import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

/**
 * Returns the signed-in user's profile, or null if not signed in / no profile.
 * Safe to call from any Server Component.
 */
export async function getProfile(): Promise<Profile | null> {
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

  const row = (profile as Profile) ?? null;
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
  isAdmin: boolean;
  isHrManagement: boolean;
  canManageUsers: boolean;
  canManageBilling: boolean;
}

export async function getUserAccess(): Promise<UserAccess | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profileRow) return null;
  const profile = profileRow as Profile;
  if (profile.deactivated_at) return null;

  const { data: memberships } = await supabase
    .from("profile_departments")
    .select("departments(slug)")
    .eq("profile_id", user.id);

  // A foreign-key embed returns a single related row at runtime, though the
  // generated types model it as an array — handle both shapes defensively.
  type SlugRow = { slug: string };
  const membershipRows = (memberships ?? []) as Array<{
    departments: SlugRow | SlugRow[] | null;
  }>;
  const departmentSlugs = membershipRows
    .map((m) => {
      const d = m.departments;
      if (!d) return undefined;
      return Array.isArray(d) ? d[0]?.slug : d.slug;
    })
    .filter((s): s is string => Boolean(s));

  const isAdmin = profile.role === "admin";
  const isHrManagement = departmentSlugs.includes("hr-management");
  const canManage = isAdmin || isHrManagement;

  return {
    profile,
    departmentSlugs,
    isAdmin,
    isHrManagement,
    canManageUsers: canManage,
    canManageBilling: canManage,
  };
}

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
