import { requireReportViewer } from "@/lib/auth";
import { ReportingTabs } from "@/components/reporting/reporting-tabs";

/**
 * Reporting shell — admins, HR & Management, and team leads. Team leads see
 * only their own department(s); each page scopes the data accordingly, and RLS
 * on activity_logs / eod_reports / task_activity independently confines what
 * every viewer can read.
 */
export default async function ReportingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireReportViewer();

  return (
    <>
      <ReportingTabs />
      {children}
    </>
  );
}
