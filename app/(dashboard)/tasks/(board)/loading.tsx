import { RouteSkeleton } from "@/components/route-skeleton";

/**
 * My Board draws hundreds of sticky notes, so it takes a few hundred
 * milliseconds: show its shape the instant it is opened (the Tasks sub-tabs
 * above stay real). It lives in the (board) route group so that only My Board
 * gets it — the lighter Tasks tabs arrive faster than a placeholder would be
 * held on screen. See components/route-skeleton.tsx.
 */
export default function Loading() {
  return <RouteSkeleton />;
}
