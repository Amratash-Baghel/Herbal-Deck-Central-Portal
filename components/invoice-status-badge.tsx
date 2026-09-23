import type { InvoiceStatus } from "@/lib/types";

/**
 * Pale note tops, the same band the calendar chips and board notes use — note
 * ink stays legible on them in all six themes, so no `dark:` pair is needed.
 * `cleared` keeps `bg-primary`: it's the colour people already read as "done".
 */
const STYLES: Record<InvoiceStatus, string> = {
  pending: "bg-[var(--n-amber)] text-[var(--note-ink)]",
  cleared: "bg-primary text-primary-foreground",
  rejected: "bg-[var(--n-red)] text-[var(--note-ink)]",
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
