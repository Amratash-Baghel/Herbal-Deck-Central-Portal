import { RouteSkeleton } from "@/components/route-skeleton";

/**
 * The dashboard gathers tasks, unread chats and reports, so it takes a moment. Show its shape the instant it is opened. See
 * components/route-skeleton.tsx.
 */
export default function Loading() {
  return <RouteSkeleton />;
}
