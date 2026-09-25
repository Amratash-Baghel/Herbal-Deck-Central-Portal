"use client";

import { useState, type CSSProperties } from "react";
import { avatarUrl, initialsOf } from "@/lib/avatar";
import { GroupBadge, GROUP_BADGES, stableIndex, type GroupBadgeName } from "./group-badges";

const COLORS = ["#507664", "#72639f", "#427c99", "#a16b49", "#9b5978", "#4f7980"];
export function ChatAvatar({ id, name, kind = "person", avatarPath, color, badge, size = "row" }: { id: string; name: string; kind?: "person" | "group"; avatarPath?: string | null; color?: string | null; badge?: GroupBadgeName; size?: "row" | "header" | "message" | "detail" }) {
  const src = kind === "person" ? avatarUrl(avatarPath) : null;
  const [failed, setFailed] = useState<string | null>(null);
  const tint = color && /^#[\da-f]{3,8}$/i.test(color) ? color : COLORS[stableIndex(id, COLORS.length)];
  return <span aria-hidden="true" className={`chat-avatar chat-avatar--${kind} chat-avatar--${size}`} style={{ "--avatar-color": tint } as CSSProperties}>
    {src && failed !== src ? (
      // eslint-disable-next-line @next/next/no-img-element -- Existing Supabase avatar URLs, with local fallback.
      <img src={src} alt="" onError={() => setFailed(src)}/>
    ) : kind === "group" ? <GroupBadge name={badge || GROUP_BADGES[stableIndex(id, GROUP_BADGES.length)]}/> : <span>{initialsOf(name) || "?"}</span>}
  </span>;
}
