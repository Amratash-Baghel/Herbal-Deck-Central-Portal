import { RouteSkeleton } from "@/components/route-skeleton";

/**
 * Chat loads the conversation list and the open thread, so it takes a moment. Show its shape the instant it is opened. See
 * components/route-skeleton.tsx.
 */
export default function Loading() {
  return <RouteSkeleton />;
}
