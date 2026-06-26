import Link from "next/link";
import type { ComponentType, SVGProps } from "react";

export interface Tool {
  title: string;
  description: string;
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Small status label, e.g. "Coming soon". */
  badge?: string;
}

/**
 * A dashboard tool card. Cards are data-driven (see app/(dashboard)/dashboard),
 * so adding a new module to the dashboard is just adding an entry to the list.
 */
export function ToolCard({ tool }: { tool: Tool }) {
  const Icon = tool.icon;
  return (
    <Link
      href={tool.href}
      className="group flex flex-col rounded-2xl border bg-card p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-primary">
          <Icon className="h-5 w-5" />
        </span>
        {tool.badge && (
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            {tool.badge}
          </span>
        )}
      </div>
      <h3 className="mt-4 text-base font-semibold tracking-tight">
        {tool.title}
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">{tool.description}</p>
    </Link>
  );
}
