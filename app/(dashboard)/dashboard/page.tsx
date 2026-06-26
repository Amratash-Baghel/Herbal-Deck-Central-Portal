import { requireProfile } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { ToolCard, type Tool } from "@/components/tool-card";
import { BillingIcon } from "@/components/icons";

/**
 * Dashboard tools. Add a module by appending to this list and creating its
 * page + nav entry. The grid scales automatically.
 */
const tools: Tool[] = [
  {
    title: "Billing & Invoices",
    description: "Track invoices, payments, and billing activity.",
    href: "/billing",
    icon: BillingIcon,
    badge: "Coming soon",
  },
];

export default async function DashboardPage() {
  const profile = await requireProfile();
  const firstName = (profile.full_name || profile.email).split(/[\s@]+/)[0];

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
        {tools.map((tool) => (
          <ToolCard key={tool.href} tool={tool} />
        ))}
      </section>
    </>
  );
}
