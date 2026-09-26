import { RouteSkeleton } from "@/components/route-skeleton";

/**
 * Employee Management loads every team member with their departments, so it takes a moment. Show its shape the instant it is opened. See
 * components/route-skeleton.tsx.
 */
export default function Loading() {
  return <RouteSkeleton />;
}
