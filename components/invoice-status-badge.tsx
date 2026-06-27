import type { InvoiceStatus } from "@/lib/types";

const STYLES: Record<InvoiceStatus, string> = {
  pending:
    "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  cleared: "bg-primary text-primary-foreground",
  rejected: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300",
};

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STYLES[status]}`}
    >
      {status}
    </span>
  );
}
