import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { AvatarUpload } from "@/components/avatar-upload";
import { ChangePasswordCard } from "@/components/change-password-card";
import { ProfileNameForm } from "@/components/profile-name-form";

function roleLabel(role: string): string {
  if (role === "team_lead") return "Team Lead";
  if (role === "admin") return "Admin";
  return "Employee";
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b py-2.5 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

/**
 * My Profile — every employee's own page. Shows their details, lets them set a
 * profile picture, and holds the Change-password control (moved here from the
 * sidebar). Read-only for the details; only the avatar and password are
 * editable by the employee themselves.
 */
export default async function ProfilePage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: membs } = await supabase
    .from("profile_departments")
    .select("departments(name)")
    .eq("profile_id", profile.id);
  type DeptRow = { name: string };
  const departments = ((membs ?? []) as Array<{ departments: DeptRow | DeptRow[] | null }>)
    .map((m) => (Array.isArray(m.departments) ? m.departments[0] : m.departments))
    .filter((d): d is DeptRow => Boolean(d))
    .map((d) => d.name);

  const name = profile.full_name || profile.email;
  const joined = new Date(profile.created_at).toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <>
      <PageHeader title="My Profile" description="Your details, picture, and password." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border bg-card p-6 shadow-sm">
          <h2 className="text-base font-semibold tracking-tight">Profile picture</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Shown in the sidebar, on your tasks, and to your team.
          </p>
          <div className="mt-5">
            <AvatarUpload name={name} avatarPath={profile.avatar_path} />
          </div>
        </section>

        <section className="rounded-2xl border bg-card p-6 shadow-sm">
          <h2 className="text-base font-semibold tracking-tight">Details</h2>
          <div className="mt-4">
            <ProfileNameForm
              fullName={profile.full_name}
              dateOfBirth={profile.date_of_birth}
            />
          </div>
          <div className="mt-4">
            <Detail label="Email" value={profile.email} />
            {profile.post && <Detail label="Post" value={profile.post} />}
            <Detail label="Role" value={roleLabel(profile.role)} />
            <Detail
              label="Department"
              value={departments.length ? departments.join(", ") : "—"}
            />
            <Detail label="Joined" value={joined} />
          </div>
        </section>

        <section className="rounded-2xl border bg-card p-6 shadow-sm lg:col-span-2">
          <h2 className="text-base font-semibold tracking-tight">Change password</h2>
          <div className="mt-3">
            <ChangePasswordCard email={profile.email} />
          </div>
        </section>
      </div>
    </>
  );
}
