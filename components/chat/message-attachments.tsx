"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  signedAttachmentUrl,
  humanFileSize,
  extOf,
  isDrivePath,
  isLinkShared,
  driveFileId,
  driveLinks,
} from "@/lib/chat-attachments";
import { FileIcon, DownloadIcon } from "@/components/icons";
import type { MessageAttachment } from "@/lib/types";

type Urls = { view: string; download: string; thumb: string; preview?: string };

/**
 * Where to show, open and download an attachment:
 *  - large Drive files: straight from Google by their secret link;
 *  - small Drive files: through /api/chat-files (membership checked each time);
 *  - older files: a short-lived Supabase signed URL.
 * The download link always gives the original file, at full resolution.
 */
function useFileUrls(supabase: SupabaseClient, att: MessageAttachment): Urls | null {
  const id = driveFileId(att.path);
  const direct: Urls | null =
    id && isLinkShared(att)
      ? { ...driveLinks(id), thumb: driveLinks(id).thumbnail }
      : isDrivePath(att.path)
        ? (() => {
            const view = `/api/chat-files?path=${encodeURIComponent(att.path)}`;
            return { view, download: `${view}&download=1`, thumb: view };
          })()
        : null;

  const [signed, setSigned] = useState<string | null>(null);
  useEffect(() => {
    if (direct) return;
    let cancelled = false;
    signedAttachmentUrl(supabase, att.path).then((u) => {
      if (!cancelled) setSigned(u);
    });
    return () => {
      cancelled = true;
    };
    // `direct` is derived from att.path alone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, att.path]);

  if (direct) return direct;
  return signed ? { view: signed, download: signed, thumb: signed } : null;
}

/** File name, size and a Download button under a photo or video. */
function Caption({ att, download }: { att: MessageAttachment; download?: string }) {
  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 text-[11px] text-muted-foreground">
      <span className="min-w-0 flex-1 truncate" title={att.name}>
        {att.name}
        {att.size > 0 && <span> · {humanFileSize(att.size)}</span>}
      </span>
      {download && (
        <a
          href={download}
          download={att.name}
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-primary transition hover:bg-accent"
          title="Download the original file"
        >
          <DownloadIcon className="h-3.5 w-3.5" />
          Original
        </a>
      )}
    </div>
  );
}

function ImageAttachment({ supabase, att }: { supabase: SupabaseClient; att: MessageAttachment }) {
  const urls = useFileUrls(supabase, att);
  const [broken, setBroken] = useState(false);
  if (broken) return <DocAttachment supabase={supabase} att={att} />;
  return (
    <div className="w-fit max-w-[16rem] overflow-hidden rounded-xl border bg-card shadow-sm">
      <a href={urls?.view} target="_blank" rel="noreferrer" title={`Open ${att.name}`} className="block transition hover:opacity-95">
        {urls ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={urls.thumb}
            alt={att.name}
            loading="lazy"
            onError={() => setBroken(true)}
            className="max-h-56 w-auto max-w-full object-cover"
          />
        ) : (
          <div className="flex h-32 w-40 items-center justify-center text-xs text-muted-foreground">Loading…</div>
        )}
      </a>
      {isDrivePath(att.path) && <Caption att={att} download={urls?.download} />}
    </div>
  );
}

function VideoAttachment({ supabase, att }: { supabase: SupabaseClient; att: MessageAttachment }) {
  const urls = useFileUrls(supabase, att);
  return (
    <div className="w-80 max-w-[78vw] overflow-hidden rounded-xl border bg-card shadow-sm">
      {urls?.preview ? (
        // Google's player streams large videos at a quality that suits the
        // connection. Just after upload it may say it is still processing.
        <iframe
          src={urls.preview}
          title={att.name}
          allow="autoplay; fullscreen"
          allowFullScreen
          loading="lazy"
          className="aspect-video w-full bg-black"
        />
      ) : urls ? (
        <video src={urls.view} controls preload="metadata" className="aspect-video w-full bg-black" />
      ) : (
        <div className="flex aspect-video w-full items-center justify-center text-xs text-muted-foreground">Loading…</div>
      )}
      <Caption att={att} download={urls?.download} />
    </div>
  );
}

function DocAttachment({ supabase, att }: { supabase: SupabaseClient; att: MessageAttachment }) {
  const urls = useFileUrls(supabase, att);
  const ext = extOf(att.name).toUpperCase();
  return (
    <a
      href={urls?.download}
      target="_blank"
      rel="noreferrer"
      download={att.name}
      className="flex w-64 max-w-[78vw] items-center gap-3 rounded-xl border bg-card px-3 py-2.5 text-left text-foreground shadow-sm transition hover:bg-accent/50"
    >
      <span className="relative flex h-10 w-9 shrink-0 items-center justify-center">
        <FileIcon className="h-9 w-9 text-muted-foreground" />
        {ext && (
          <span className="absolute bottom-1 text-[7px] font-bold tracking-tight text-primary">{ext.slice(0, 4)}</span>
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
 * Files shared with a message: photos as previews with a full-resolution
 * download, videos with a player, everything else as a download card.
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
        ) : att.kind === "video" ? (
          <VideoAttachment key={att.path} supabase={supabase} att={att} />
        ) : (
          <DocAttachment key={att.path} supabase={supabase} att={att} />
        ),
      )}
    </div>
  );
}
