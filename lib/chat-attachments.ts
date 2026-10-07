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
export const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024; // 3 MB (Supabase Storage only)
export const MAX_ATTACHMENTS_PER_MESSAGE = 6;

/** Chat files go to Google Drive instead of Supabase Storage when this is set
 *  (see lib/google-drive.ts and app/api/chat-files). Older files keep working
 *  either way: each stored path says where it lives. With Drive on, any file
 *  type and any size is accepted. */
export const USE_DRIVE = process.env.NEXT_PUBLIC_CHAT_STORAGE === "gdrive";

/** Drive files above this go straight from the browser to Google (resumable,
 *  no size limit) and are opened from Google by a secret link. Smaller ones
 *  pass through the portal, which checks chat membership on every open. It
 *  sits under Vercel's ~4.5 MB request limit. */
export const DIRECT_UPLOAD_BYTES = 4 * 1024 * 1024;

export type AttachmentKind = "image" | "video" | "document";

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
  gif: { mime: "image/gif", kind: "image", label: "GIF" },
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

/** The `accept` attribute for the file picker ("" = anything, with Drive on). */
export const ATTACHMENT_ACCEPT = USE_DRIVE
  ? ""
  : ".jpg,.jpeg,.png,.gif,.pdf,.doc,.docx,.xlsx,image/jpeg,image/png,image/gif,application/pdf";

/** Images the chat shows inline. Other image types (SVG, HEIC, PSD…) are files. */
const INLINE_IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

/** How a Drive-stored file is shown, from its mime type. */
export function kindForMime(mime: string): AttachmentKind {
  if (INLINE_IMAGE_MIMES.has(mime)) return "image";
  if (mime.startsWith("video/")) return "video";
  return "document";
}

/** A safe mime string, or the generic binary type. */
function cleanMime(raw: unknown): string {
  return typeof raw === "string" && raw.length <= 100 && /^[\w.+-]+\/[\w.+-]+$/.test(raw)
    ? raw.toLowerCase()
    : "application/octet-stream";
}

/** A short, safe extension for a stored path ("bin" when the name has none). */
function safeExt(name: string): string {
  const ext = extOf(name);
  return /^[a-z0-9]{1,10}$/.test(ext) ? ext : "bin";
}

/** The private bucket holding each person's reusable GIFs, at `<profile_id>/<uuid>.gif`. */
export const GIF_BUCKET = "gif-library";

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
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

export type FileCheck =
  | { ok: true; ext: string; mime: string; kind: AttachmentKind }
  | { ok: false; reason: "too_large" | "bad_type"; error: string };

/**
 * Validate a picked file by extension and size. A too-large result is handled
 * specially by the composer (it offers the Drive/Dropbox fallback).
 */
export function checkFile(file: { name: string; size: number; type?: string }): FileCheck {
  if (USE_DRIVE) {
    // Google Drive takes any type and up to 5 TB per file.
    const known = ALLOWED_TYPES[extOf(file.name)];
    const mime = known?.mime ?? cleanMime(file.type);
    return { ok: true, ext: safeExt(file.name), mime, kind: kindForMime(mime) };
  }
  const ext = extOf(file.name);
  const t = ALLOWED_TYPES[ext];
  if (!t) {
    return {
      ok: false,
      reason: "bad_type",
      error: "That file type isn't supported. Allowed: JPG, PNG, GIF, PDF, DOC, DOCX, XLSX.",
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
    if (isDrivePath(path)) {
      // Drive files: any type and size. The download route re-checks the real
      // file in Drive, so these values only drive how the card is drawn.
      if (!/^[^/]+\/gdrive\/[A-Za-z0-9_-]+\.[a-z0-9]{1,10}$/.test(path)) return null;
      if (!Number.isFinite(size) || size < 0) return null;
      const mime = cleanMime(a.mime);
      out.push({ path, name, size, mime, kind: kindForMime(mime) });
      continue;
    }
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
/** True for an attachment path stored in Google Drive. */
export function isDrivePath(path: string): boolean {
  return /^[^/]+\/gdrive\//.test(path);
}

/** The Google Drive file id inside a Drive attachment path. */
export function driveFileId(path: string): string | null {
  return path.match(/^[^/]+\/gdrive\/([A-Za-z0-9_-]+)\./)?.[1] ?? null;
}

/** Large Drive files are opened straight from Google by their secret link. */
export function isLinkShared(att: { path: string; size: number }): boolean {
  return isDrivePath(att.path) && att.size > DIRECT_UPLOAD_BYTES;
}

/** Google's own pages for a link-shared file. */
export function driveLinks(fileId: string) {
  return {
    view: `https://drive.google.com/file/d/${fileId}/view`,
    preview: `https://drive.google.com/file/d/${fileId}/preview`,
    thumbnail: `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`,
    download: `https://drive.usercontent.google.com/download?id=${fileId}&export=download`,
  };
}

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
  if (USE_DRIVE) {
    return file.size > DIRECT_UPLOAD_BYTES
      ? uploadStraightToDrive({ conversationId, file, mime, onProgress, signal })
      : uploadToDriveRoute({ conversationId, file, mime, kind, onProgress, signal });
  }
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

/** Upload through /api/chat-files (Google Drive), with real progress. */
function uploadToDriveRoute(opts: {
  conversationId: string;
  file: File;
  mime: string;
  kind: AttachmentKind;
  onProgress?: (pct: number) => void;
  signal?: AbortSignal;
}): Promise<Attachment> {
  const { conversationId, file, mime, kind, onProgress, signal } = opts;
  return new Promise<Attachment>((resolve, reject) => {
    const form = new FormData();
    form.set("conversationId", conversationId);
    form.set("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/chat-files");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let body: { path?: string; error?: string } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        // fall through to the generic error
      }
      if (xhr.status >= 200 && xhr.status < 300 && body.path) {
        resolve({ path: body.path, name: file.name.slice(0, 200), mime, size: file.size, kind });
      } else {
        reject(new Error(body.error || "Upload failed. Please try again."));
      }
    };
    xhr.onerror = () => reject(new Error("Upload failed. Please check your connection."));
    xhr.onabort = () => reject(new Error("Upload cancelled."));
    if (signal) signal.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(form);
  });
}

/** Google accepts resumable chunks in multiples of 256 KiB. */
const CHUNK_BYTES = 16 * 1024 * 1024;

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || "Upload failed. Please try again.");
  return data;
}

type ChunkResult = { done: true; fileId: string } | { done: false; next: number };

/** PUT one chunk (or, with no body, ask Google how much it already has). */
function putChunk(
  uploadUrl: string,
  file: File,
  start: number,
  end: number,
  onChunkProgress: (loaded: number) => void,
  signal?: AbortSignal,
): Promise<ChunkResult> {
  return new Promise((resolve, reject) => {
    const total = file.size;
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("content-range", end > start ? `bytes ${start}-${end - 1}/${total}` : `bytes */${total}`);
    xhr.upload.onprogress = (e) => onChunkProgress(e.loaded);
    xhr.onload = () => {
      if (xhr.status === 200 || xhr.status === 201) {
        try {
          resolve({ done: true, fileId: (JSON.parse(xhr.responseText) as { id: string }).id });
        } catch {
          reject(new Error("Upload finished but Google's reply was unreadable."));
        }
      } else if (xhr.status === 308) {
        // "Resume incomplete": Range says what Google has. If the header isn't
        // readable, trust that the chunk we just sent arrived.
        const range = xhr.getResponseHeader("range");
        const have = range?.match(/bytes=0-(\d+)/);
        resolve({ done: false, next: have ? Number(have[1]) + 1 : end > start ? end : 0 });
      } else {
        reject(Object.assign(new Error(`Upload interrupted (${xhr.status}).`), { retry: xhr.status >= 500 || xhr.status === 0 }));
      }
    };
    xhr.onerror = () => reject(Object.assign(new Error("Connection lost."), { retry: true }));
    xhr.onabort = () => reject(new Error("Upload cancelled."));
    if (signal) signal.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(end > start ? file.slice(start, end) : null);
  });
}

/**
 * Large files: the portal opens a resumable upload session in Google Drive and
 * the browser sends the file straight there in 16 MB chunks — nothing passes
 * through Vercel, so there is no size cap. A dropped connection resumes from
 * the last chunk Google confirmed instead of starting over. The portal then
 * switches on the file's secret link and returns the attachment.
 */
async function uploadStraightToDrive(opts: {
  conversationId: string;
  file: File;
  mime: string;
  onProgress?: (pct: number) => void;
  signal?: AbortSignal;
}): Promise<Attachment> {
  const { conversationId, file, mime, onProgress, signal } = opts;
  const { uploadUrl } = await postJson<{ uploadUrl: string }>("/api/chat-files/session", {
    conversationId,
    name: file.name.slice(0, 200),
    size: file.size,
    mime,
  });

  let offset = 0;
  let fileId: string | null = null;
  let failures = 0;
  const report = (sent: number) => onProgress?.(Math.min(99, Math.floor((sent / file.size) * 100)));
  while (!fileId) {
    if (signal?.aborted) throw new Error("Upload cancelled.");
    const end = Math.min(offset + CHUNK_BYTES, file.size);
    try {
      const result = await putChunk(uploadUrl, file, offset, end, (loaded) => report(offset + loaded), signal);
      failures = 0;
      if (result.done) fileId = result.fileId;
      else offset = result.next;
      report(offset);
    } catch (e) {
      const retry = (e as { retry?: boolean }).retry;
      if (!retry || ++failures > 6) throw e instanceof Error ? e : new Error("Upload failed.");
      // Wait (2s, 4s, 8s… up to 30s), then ask Google where to carry on from.
      await new Promise((r) => setTimeout(r, Math.min(30_000, 1000 * 2 ** failures)));
      try {
        const status = await putChunk(uploadUrl, file, 0, 0, () => {}, signal);
        if (status.done) fileId = status.fileId;
        else offset = status.next;
      } catch {
        // still offline; the loop retries
      }
    }
  }

  const done = await postJson<{ path: string; size: number; mime: string; name: string }>("/api/chat-files/finalize", {
    conversationId,
    fileId,
  });
  onProgress?.(100);
  const finalMime = done.mime || mime;
  return { path: done.path, name: done.name || file.name.slice(0, 200), mime: finalMime, size: done.size, kind: kindForMime(finalMime) };
}

/** Mint a short-lived signed URL for a private attachment (participant-gated by
 *  RLS). Cached per path for the session so re-renders don't re-request. */
const signedUrlCache = new Map<string, Promise<string | null>>();

export function signedAttachmentUrl(
  supabase: SupabaseClient,
  path: string,
): Promise<string | null> {
  // Drive files are served by our own route, which checks membership itself.
  if (isDrivePath(path)) return Promise.resolve(`/api/chat-files?path=${encodeURIComponent(path)}`);
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
