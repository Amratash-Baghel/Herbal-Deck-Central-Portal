import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Chat file attachments — the shared, framework-agnostic pieces used by the
 * composer (upload), the message renderer (signed URLs), and the send action
 * (server-side validation).
 *
 * Small files (≤ 3 MB) upload directly to the private `chat-attachments` bucket;
 * larger files are shared as Google Drive / Dropbox links, which we detect and
 * render as rich cards. See docs/decisions.md for why the split exists.
 */

export const CHAT_BUCKET = "chat-attachments";
export const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024; // 3 MB
export const MAX_ATTACHMENTS_PER_MESSAGE = 6;

export type AttachmentKind = "image" | "document";

/** A stored attachment, as persisted on `messages.attachments`. */
export interface Attachment {
  /** Path within the bucket: "<conversation_id>/<uuid>.<ext>". */
  path: string;
  /** Original file name (for display / download). */
  name: string;
  mime: string;
  size: number;
  kind: AttachmentKind;
}

/** Extension → canonical mime / kind / label. This is the source of truth for
 *  what's allowed; the browser's reported mime is not trusted. */
export const ALLOWED_TYPES: Record<
  string,
  { mime: string; kind: AttachmentKind; label: string }
> = {
  jpg: { mime: "image/jpeg", kind: "image", label: "JPG image" },
  jpeg: { mime: "image/jpeg", kind: "image", label: "JPG image" },
  png: { mime: "image/png", kind: "image", label: "PNG image" },
  pdf: { mime: "application/pdf", kind: "document", label: "PDF" },
  doc: { mime: "application/msword", kind: "document", label: "Word document" },
  docx: {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    kind: "document",
    label: "Word document",
  },
  xlsx: {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    kind: "document",
    label: "Excel spreadsheet",
  },
};

/** The `accept` attribute for the file picker. */
export const ATTACHMENT_ACCEPT = ".jpg,.jpeg,.png,.pdf,.doc,.docx,.xlsx,image/jpeg,image/png,application/pdf";

/** Lowercased extension of a filename, or "". */
export function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

/** A compact, human file size, e.g. "12 KB", "1.4 MB". */
export function humanFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export type FileCheck =
  | { ok: true; ext: string; mime: string; kind: AttachmentKind }
  | { ok: false; reason: "too_large" | "bad_type"; error: string };

/**
 * Validate a picked file by extension and size. A too-large result is handled
 * specially by the composer (it offers the Drive/Dropbox fallback).
 */
export function checkFile(file: { name: string; size: number }): FileCheck {
  const ext = extOf(file.name);
  const t = ALLOWED_TYPES[ext];
  if (!t) {
    return {
      ok: false,
      reason: "bad_type",
      error: "That file type isn't supported. Allowed: JPG, PNG, PDF, DOC, DOCX, XLSX.",
    };
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return {
      ok: false,
      reason: "too_large",
      error:
        "This file is larger than 3MB. Please upload it to Google Drive or Dropbox and paste the share link instead.",
    };
  }
  return { ok: true, ext, mime: t.mime, kind: t.kind };
}

/**
 * Server-side sanitiser for the attachment metadata a client submits with a
 * message. Recomputes mime/kind from the (allowed) extension so a client can't
 * spoof them, and confirms the file lives under this conversation's folder.
 * Returns the trusted list, or null if anything is invalid.
 */
export function sanitizeAttachments(
  conversationId: string,
  raw: unknown,
): Attachment[] | null {
  if (raw == null) return [];
  if (!Array.isArray(raw)) return null;
  if (raw.length > MAX_ATTACHMENTS_PER_MESSAGE) return null;

  const out: Attachment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const a = item as Record<string, unknown>;
    const path = typeof a.path === "string" ? a.path : "";
    const name = typeof a.name === "string" ? a.name.slice(0, 200) : "";
    const size = typeof a.size === "number" ? a.size : NaN;
    if (!path.startsWith(`${conversationId}/`)) return null;
    if (!name) return null;
    if (!Number.isFinite(size) || size < 0 || size > MAX_ATTACHMENT_BYTES) return null;
    const t = ALLOWED_TYPES[extOf(path)] ?? ALLOWED_TYPES[extOf(name)];
    if (!t) return null;
    out.push({ path, name, size, mime: t.mime, kind: t.kind });
  }
  return out;
}

/**
 * Upload a file to the private chat bucket via a direct XHR to the Storage REST
 * endpoint, reporting real progress (the supabase-js `upload` helper doesn't
 * surface progress). RLS on the bucket enforces that only a participant of the
 * conversation can write here. Resolves to the stored `Attachment`.
 */
export function uploadChatAttachment(opts: {
  conversationId: string;
  file: File;
  accessToken: string;
  ext: string;
  mime: string;
  kind: AttachmentKind;
  onProgress?: (pct: number) => void;
  signal?: AbortSignal;
}): Promise<Attachment> {
  const { conversationId, file, accessToken, ext, mime, kind, onProgress, signal } = opts;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const path = `${conversationId}/${crypto.randomUUID()}.${ext}`;

  return new Promise<Attachment>((resolve, reject) => {
    if (!base || !anon) {
      reject(new Error("Storage is not configured."));
      return;
    }
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${base}/storage/v1/object/${CHAT_BUCKET}/${encodeURI(path)}`);
    xhr.setRequestHeader("authorization", `Bearer ${accessToken}`);
    xhr.setRequestHeader("apikey", anon);
    xhr.setRequestHeader("content-type", mime);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("cache-control", "3600");

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({ path, name: file.name.slice(0, 200), mime, size: file.size, kind });
      } else if (xhr.status === 413) {
        reject(new Error("That file is larger than the 3MB limit."));
      } else {
        reject(new Error("Upload failed. Please try again."));
      }
    };
    xhr.onerror = () => reject(new Error("Upload failed. Please check your connection."));
    xhr.onabort = () => reject(new Error("Upload cancelled."));
    if (signal) {
      signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }
    xhr.send(file);
  });
}

/** Mint a short-lived signed URL for a private attachment (participant-gated by
 *  RLS). Cached per path for the session so re-renders don't re-request. */
const signedUrlCache = new Map<string, Promise<string | null>>();

export function signedAttachmentUrl(
  supabase: SupabaseClient,
  path: string,
): Promise<string | null> {
  const cached = signedUrlCache.get(path);
  if (cached) return cached;
  const p = supabase.storage
    .from(CHAT_BUCKET)
    .createSignedUrl(path, 3600)
    .then(({ data }) => data?.signedUrl ?? null)
    .catch(() => null);
  signedUrlCache.set(path, p);
  return p;
}

// --- Google Drive / Dropbox share-link detection ---------------------------

export type LinkProvider = "drive" | "dropbox";

export interface ShareLink {
  provider: LinkProvider;
  url: string;
  /** Drive file id, when the URL is a single shared file (not a folder). */
  driveFileId?: string;
  /** Best-effort display name (Dropbox share URLs often carry the filename). */
  fileName?: string;
  isFolder: boolean;
}

const URL_RE = /https?:\/\/[^\s<]+/gi;

function parseDrive(url: string): ShareLink | null {
  if (!/(?:drive|docs)\.google\.com/i.test(url)) return null;
  const folder = /\/drive\/folders\//i.test(url) || /\/drive\/u\/\d+\/folders\//i.test(url);
  // /file/d/<id>/  or  ?id=<id>  or  /document|spreadsheets|presentation/d/<id>
  const idMatch =
    url.match(/\/(?:file|document|spreadsheets|presentation)\/d\/([a-zA-Z0-9_-]+)/) ||
    url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return {
    provider: "drive",
    url,
    driveFileId: folder ? undefined : (idMatch?.[1] ?? undefined),
    isFolder: folder,
  };
}

function parseDropbox(url: string): ShareLink | null {
  if (!/dropbox\.com/i.test(url)) return null;
  const folder = /\/(?:scl\/fo|sh)\//i.test(url);
  let fileName: string | undefined;
  try {
    const clean = decodeURIComponent(new URL(url).pathname);
    const last = clean.split("/").filter(Boolean).pop();
    if (last && /\.[a-z0-9]{1,8}$/i.test(last)) fileName = last;
  } catch {
    // ignore malformed URLs
  }
  return { provider: "dropbox", url, fileName, isFolder: folder };
}

/** Find the Google Drive / Dropbox share links in a message body (max 3). */
export function detectShareLinks(body: string): ShareLink[] {
  const out: ShareLink[] = [];
  const seen = new Set<string>();
  const matches = body.match(URL_RE) ?? [];
  for (const raw of matches) {
    const url = raw.replace(/[.,);]+$/, ""); // trim trailing punctuation
    if (seen.has(url)) continue;
    const link = parseDrive(url) ?? parseDropbox(url);
    if (link) {
      seen.add(url);
      out.push(link);
      if (out.length >= 3) break;
    }
  }
  return out;
}

/** A Drive thumbnail URL for a shared file id (works for images, PDFs, docs).
 *  Render with an onError fallback to a generic icon. */
export function driveThumbnailUrl(fileId: string): string {
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w600`;
}
