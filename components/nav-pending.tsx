"use client";

import { useLinkStatus } from "next/link";

/**
 * A small dot at the end of a sidebar item that pulses while its navigation is
 * pending — only noticeable if the click can't show the destination's loading
 * state straight away (its prefetch hasn't landed yet, e.g. just after a save
 * cleared the prefetch cache). Always rendered, fixed size, so it never shifts
 * the label; it only fades in after 100 ms (`.link-pending` in globals.css).
 * Must sit inside the <Link> it reports on.
 */
export function NavPending() {
  const { pending } = useLinkStatus();
  return <span aria-hidden="true" className={`link-pending ${pending ? "is-pending" : ""}`} />;
}
