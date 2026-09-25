import type { ReactNode } from "react";

export const GROUP_BADGES = ["layers", "leaf", "team", "folder", "launch", "announce"] as const;
export type GroupBadgeName = typeof GROUP_BADGES[number];
export const BADGE_LABELS: Record<GroupBadgeName, string> = { layers: "Design", leaf: "Growth", team: "Team", folder: "Project", launch: "Launch", announce: "Announcements" };
const shapes: Record<GroupBadgeName, ReactNode> = {
  layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></>,
  leaf: <><path d="M20 3C9 3 4 7 4 13a7 7 0 0 0 7 7c7 0 9-9 9-17Z"/><path d="M4 21 15 10M9 16v-5M9 16h5"/></>,
  team: <><circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M17 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 5"/></>,
  folder: <><path d="M3 7V5a2 2 0 0 1 2-2h5l3 4h6a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/><path d="M8 13h8M8 17h5"/></>,
  launch: <><path d="M8 16c-3 0-4 2-4 5 3 0 5-1 5-4M8 13l-4-1 5-5 3 1M11 17l1 4 5-5-1-3M8 13c2-5 6-9 13-10-1 7-5 11-10 13l-3-3Z"/><circle cx="16" cy="8" r="1.5"/></>,
  announce: <><path d="m4 9 14-5v15L4 14V9ZM18 8h3v7h-3M7 15l2 6h4l-2-5"/></>,
};
export function stableIndex(id: string, length: number) { let hash = 0; for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0; return hash % length; }
export function GroupBadge({ name }: { name: GroupBadgeName }) { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[name]}</svg>; }
