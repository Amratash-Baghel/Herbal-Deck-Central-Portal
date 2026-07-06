"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signedAttachmentUrl, humanFileSize, extOf } from "@/lib/chat-attachments";
import { FileIcon, DownloadIcon } from "@/components/icons";
import type { MessageAttachment } from "@/lib/types";

/** Lazily mint (and cache) a signed URL for a private attachment. */
function useSignedUrl(supabase: SupabaseClient, path: string): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    signedAttachmentUrl(supabase, path).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [supabase, path]);
  return url;
}

function ImageAttachment({
  supabase,
  att,
}: {
  supabase: SupabaseClient;
  att: MessageAttachment;
}) {
  const url = useSignedUrl(supabase, att.path);
  return (
    <a
      href={url ?? undefined}
      target="_blank"
      rel="noreferrer"
      title={att.name}
      className="block w-fit max-w-[16rem] overflow-hidden rounded-xl border bg-card shadow-sm transition hover:opacity-95"
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={att.name}
          className="max-h-56 w-auto max-w-full object-cover"
        />
      ) : (
        <div className="flex h-32 w-40 items-center justify-center text-xs text-muted-foreground">
          Loading…
        </div>
      )}
    </a>
  );
}

function DocAttachment({
  supabase,
  att,
}: {
  supabase: SupabaseClient;
  att: MessageAttachment;
}) {
  const url = useSignedUrl(supabase, att.path);
  const ext = extOf(att.name).toUpperCase();
  return (
    <a
      href={url ?? undefined}
      target="_blank"
      rel="noreferrer"
      download={att.name}
      className="flex w-64 max-w-[78vw] items-center gap-3 rounded-xl border bg-card px-3 py-2.5 text-left text-foreground shadow-sm transition hover:bg-accent/50"
    >
      <span className="relative flex h-10 w-9 shrink-0 items-center justify-center">
        <FileIcon className="h-9 w-9 text-muted-foreground" />
        {ext && (
          <span className="absolute bottom-1 text-[7px] font-bold tracking-tight text-primary">
            {ext.slice(0, 4)}
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{att.name}</span>
        <span className="mt-0.5 block text-[11px] text-muted-foreground">
          {[ext, humanFileSize(att.size)].filter(Boolean).join(" · ")}
        </span>
      </span>
      <DownloadIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
    </a>
  );
}

/**
 * Files shared with a message: images as clickable thumbnails, documents as
 * file cards (icon + name + size). Both open the private file via a short-lived
 * signed URL that only conversation participants can mint (RLS).
 */
export function MessageAttachments({
  supabase,
  attachments,
}: {
  supabase: SupabaseClient;
  attachments: MessageAttachment[];
}) {
  if (!attachments || attachments.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-col gap-1.5">
      {attachments.map((att) =>
        att.kind === "image" ? (
          <ImageAttachment key={att.path} supabase={supabase} att={att} />
        ) : (
          <DocAttachment key={att.path} supabase={supabase} att={att} />
        ),
      )}
    </div>
  );
}
