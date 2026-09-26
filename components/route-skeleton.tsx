"use client";

import { usePathname } from "next/navigation";

/**
 * The instant placeholder for the portal's heavier pages (My Board, Billing →
 * Clear, Dashboard, Chat, Reporting, Employee Management), rendered by their `loading.tsx`. Those pages take a few hundred
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
  if (pathname.startsWith("/chat")) {
    return (
      <div className="route-skeleton flex flex-1 flex-col" aria-busy="true" aria-label="Loading">
        <ChatSkeleton />
      </div>
    );
  }
  return (
    <div className="route-skeleton" aria-busy="true" aria-label="Loading">
      <HeaderSkeleton />
      {pathname === "/tasks" ? (
        <BoardSkeleton />
      ) : pathname === "/employees" ? (
        <TwoColumnSkeleton />
      ) : (
        <ListSkeleton />
      )}
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

/** Chat: the conversation list beside an empty thread, filling the frame. */
function ChatSkeleton() {
  return (
    <div className="flex min-h-[70vh] flex-1 flex-col" aria-hidden="true">
      <Bar className="mb-4 h-7 w-40 rounded-lg" />
      <div className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-[minmax(240px,320px)_1fr]">
        <div className="space-y-3 rounded-2xl border bg-card p-4">
          <Bar className="h-9 rounded-xl" />
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Bar className="h-9 w-9 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Bar className="h-3 w-1/2 rounded-md" />
                <Bar className="h-3 w-3/4 rounded-md" />
              </div>
            </div>
          ))}
        </div>
        <div className="hidden rounded-2xl border bg-card md:block" />
      </div>
    </div>
  );
}

/** Employee Management: the add-employee form beside the team list. */
function TwoColumnSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" aria-hidden="true">
      {[5, 6].map((rows, col) => (
        <div key={col} className="space-y-3 rounded-2xl border bg-card p-5">
          <Bar className="h-5 w-1/3 rounded-md" />
          {Array.from({ length: rows }, (_, i) => (
            <Bar key={i} className="h-10 rounded-xl" />
          ))}
        </div>
      ))}
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
