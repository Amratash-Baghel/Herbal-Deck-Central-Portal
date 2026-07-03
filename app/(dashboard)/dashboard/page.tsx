import { getUserAccess } from "@/lib/auth";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { ToolCard, type Tool } from "@/components/tool-card";
import { BillingIcon, ChatIcon, TasksIcon, ReportingIcon } from "@/components/icons";

/**
 * Dashboard tools. Add a module by appending to this list and creating its
 * page + nav entry. The grid scales automatically. `managerOnly` cards are
 * shown only to admins + HR & Management.
 */
const tools: (Tool & { managerOnly?: boolean; reportViewerOnly?: boolean })[] = [
  {
    title: "Tasks",
    description: "Your kanban board, team tasks, and end-of-day reports.",
    href: "/tasks",
    icon: TasksIcon,
  },
  {
    title: "Billing & Invoices",
    description: "Generate, post, and clear invoices, and track spend.",
    href: "/billing",
    icon: BillingIcon,
  },
  {
    title: "Chat",
    description: "Message teammates and groups in real time.",
    href: "/chat",
    icon: ChatIcon,
  },
  {
    title: "Reporting",
    description: "Team activity, EOD reports, and per-employee reviews.",
    href: "/reporting",
    icon: ReportingIcon,
    reportViewerOnly: true,
  },
];

export default async function DashboardPage() {
  const access = await getUserAccess();
  if (!access) redirect("/login");
  const profile = access.profile;
  const firstName = (profile.full_name || profile.email).split(/[\s@]+/)[0];
  const visible = tools.filter((t) => {
    if (t.managerOnly && !access.canManageUsers) return false;
    if (t.reportViewerOnly && !access.canViewReports) return false;
    return true;
  });

  return (
    <>
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description="Your internal tools, all in one place."
      />

      <section
        aria-label="Tools"
        className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
      >
        {visible.map((tool) => (
          <ToolCard key={tool.href} tool={tool} />
        ))}
      </section>
    </>
  );
}
