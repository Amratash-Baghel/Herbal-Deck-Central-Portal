import { RouteSkeleton } from "@/components/route-skeleton";

/**
 * Clear Invoices lists every invoice with its signed files, so it takes a few
 * hundred milliseconds: show its shape the instant it is opened (the Billing
 * sub-tabs above stay real). See components/route-skeleton.tsx.
 */
export default function Loading() {
  return <RouteSkeleton />;
}
