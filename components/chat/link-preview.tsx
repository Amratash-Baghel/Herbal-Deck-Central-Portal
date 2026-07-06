"use client";

import { useState } from "react";
import { driveThumbnailUrl, type ShareLink } from "@/lib/chat-attachments";
import { DriveIcon, DropboxIcon, ExternalLinkIcon } from "@/components/icons";

function providerLabel(link: ShareLink): string {
  if (link.fileName) return link.fileName;
  if (link.provider === "drive") {
    return link.isFolder ? "Google Drive folder" : "Google Drive file";
  }
  return link.isFolder ? "Dropbox folder" : "Dropbox file";
}

function LinkCard({ link }: { link: ShareLink }) {
  const [thumbFailed, setThumbFailed] = useState(false);
  const isDrive = link.provider === "drive";
  const showThumb =
    isDrive && !link.isFolder && !!link.driveFileId && !thumbFailed;

  return (
    <a
      href={link.url}
      target="_blank"
      rel="noreferrer"
      title={link.url}
      className="flex w-64 max-w-[78vw] items-center gap-3 rounded-xl border bg-card px-3 py-2.5 text-left text-foreground shadow-sm transition hover:bg-accent/50"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
        {showThumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={driveThumbnailUrl(link.driveFileId!)}
            alt=""
            referrerPolicy="no-referrer"
            onError={() => setThumbFailed(true)}
            className="h-full w-full object-cover"
          />
        ) : isDrive ? (
          <DriveIcon className="h-5 w-5" />
        ) : (
          <DropboxIcon className="h-5 w-5" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">
          {providerLabel(link)}
        </span>
        <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-primary">
          <ExternalLinkIcon className="h-3 w-3" />
          {isDrive ? "Open in Drive" : "Open in Dropbox"}
        </span>
      </span>
    </a>
  );
}

/**
 * Rich preview cards for Google Drive / Dropbox share links found in a message,
 * shown instead of a bare hyperlink. Drive image/file links attempt a thumbnail
 * (public files only) and fall back to the brand icon; Dropbox and folders show
 * the brand icon. Styled to match the chat bubbles and theme.
 */
export function LinkPreviewCards({ links }: { links: ShareLink[] }) {
  if (!links || links.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-col gap-1.5">
      {links.map((link) => (
        <LinkCard key={link.url} link={link} />
      ))}
    </div>
  );
}
