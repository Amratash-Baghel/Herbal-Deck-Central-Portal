"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Search box for the clearing dashboard. Updates the `q` query param (keeping
 * the other filters) so the server component can filter on it.
 */
export function InvoiceSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get("q") ?? "";

  function apply(q: string) {
    const next = new URLSearchParams(params.toString());
    const trimmed = q.trim();
    if (trimmed) next.set("q", trimmed);
    else next.delete("q");
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        apply((new FormData(e.currentTarget).get("q") as string) ?? "");
      }}
      className="flex items-center gap-2"
    >
      <input
        key={current}
        name="q"
        defaultValue={current}
        placeholder="Search provider, number, or reason…"
        className="w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring sm:w-72"
      />
      <button
        type="submit"
        className="rounded-xl border px-3 py-2 text-sm font-medium transition hover:bg-accent"
      >
        Search
      </button>
      {current && (
        <button
          type="button"
          onClick={() => apply("")}
          className="rounded-xl px-2 py-2 text-sm text-muted-foreground transition hover:text-foreground"
        >
          Clear
        </button>
      )}
    </form>
  );
}
