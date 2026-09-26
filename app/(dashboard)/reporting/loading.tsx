import { RouteSkeleton } from "@/components/route-skeleton";

/**
 * Reporting builds today's team overview, so it takes a moment (the Reporting sub-tabs above stay real). Show its shape the instant it is opened. See
 * components/route-skeleton.tsx.
 */
export default function Loading() {
  return <RouteSkeleton />;
}
