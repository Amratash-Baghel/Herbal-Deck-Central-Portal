import { requireUserManager } from "@/lib/auth";
import { ReportingTabs } from "@/components/reporting/reporting-tabs";

/**
 * Reporting shell — admins + HR & Management only. `requireUserManager()`
 * gates every page in the section (redirecting anyone else), and RLS on
 * activity_logs / eod_reports / task_activity independently enforces the same.
 */
export default async function ReportingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireUserManager();

  return (
    <>
      <ReportingTabs />
      {children}
    </>
  );
}
