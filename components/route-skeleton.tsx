"use client";

import { usePathname } from "next/navigation";

/**
 * The instant placeholder for the portal's heavy pages (My Board, Billing →
 * Clear), rendered by their `loading.tsx`. Those pages take a few hundred
 * milliseconds to arrive and draw, and a click used to leave the old page
 * frozen for all of it. Their loading boundary is
 * prefetched with the link, so this appears on the frame of the click and the
 * real page replaces it.
 *
 * Only the slow pages get one on purpose: React holds a loading placeholder on
 * screen for ~300 ms before revealing the content, so on a page that arrives
 * in ~70 ms a skeleton would make the real content come later, not sooner.
 * Everywhere else the sidebar's pending dot (components/nav-pending.tsx)
 * covers a slow click.
 *
 * It borrows the page's own furniture — PageHeader's rhythm, the board's
 * corkboard wells — in the quiet `bg-muted` pulse the dashboard already uses
 * for its streaming sections, so the swap to real content moves as little as
 * possible. The pathname is the destination (the URL updates as soon as the
 * placeholder shows), which picks the shape.
 */
export function RouteSkeleton() {
  const pathname = usePathname();
  return (
    <div className="route-skeleton" aria-busy="true" aria-label="Loading">
      <HeaderSkeleton />
      {pathname === "/tasks" ? <BoardSkeleton /> : <ListSkeleton />}
    </div>
  );
}

/**
 * A pulsing placeholder shape (the caller gives size and corner radius). On a
 * `bg-muted` surface — the board's wells — it uses the page background
 * instead, so it still reads against its ground.
 */
function Bar({ className, onMuted = false }: { className: string; onMuted?: boolean }) {
  return <div className={`animate-pulse ${onMuted ? "bg-background/70" : "bg-muted"} ${className}`} />;
}

/** PageHeader's title + description, at its spacing. */
function HeaderSkeleton() {
  return (
    <div className="mb-8" aria-hidden="true">
      <Bar className="h-8 w-48 rounded-lg md:h-9 md:w-60" />
      <Bar className="mt-3 h-4 w-72 max-w-full rounded-md md:w-96" />
    </div>
  );
}

/** My Board: the Select button, then three corkboard wells with a few notes each. */
function BoardSkeleton() {
  return (
    <div aria-hidden="true">
      <Bar className="mb-4 h-[34px] w-[88px] rounded-lg" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[4, 3, 3].map((notes, col) => (
          <div key={col} className="col-well flex flex-col gap-3 rounded-3xl border bg-muted p-3">
            <div className="flex items-center justify-between px-1 py-0.5">
              <Bar className="h-4 w-20 rounded-md" onMuted />
              <Bar className="h-4 w-8 rounded-full" onMuted />
            </div>
            {Array.from({ length: notes }, (_, i) => (
              <Bar key={i} className="h-20 rounded-xl" onMuted />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Lists and report pages: a few card-shaped rows. */
function ListSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      {["h-24", "h-24", "h-24", "h-16"].map((h, i) => (
        <div key={i} className={`rounded-2xl border bg-card ${h}`}>
          <div className="space-y-2.5 p-5">
            <Bar className="h-4 w-1/3 rounded-md" />
            <Bar className="h-3 w-2/3 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}
