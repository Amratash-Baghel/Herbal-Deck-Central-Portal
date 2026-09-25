import type { ReactNode } from "react";

/**
 * Consistent page heading used across portal pages: a title and an optional
 * supporting description, with generous spacing below. An optional action sits
 * in the top-right corner, wrapping under the title on a narrow screen.
 */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground md:text-base">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}
