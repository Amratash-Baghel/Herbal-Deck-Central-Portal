import { NextResponse, type NextRequest } from "next/server";
import { checkFile, DIRECT_UPLOAD_BYTES, driveLinks } from "@/lib/chat-attachments";
import { driveConfigured, uploadToDrive, driveFileFor, downloadFromDrive } from "@/lib/google-drive";
import { chatParticipant } from "./participant";

/**
 * Chat attachments stored in Google Drive (see lib/google-drive.ts).
 *
 *   POST  form-data { conversationId, file }  → { path }     (files ≤ 4 MB)
 *   GET   ?path=<conversationId>/gdrive/<fileId>.<ext>  → the file
 *
 * Larger files skip this route: ./session and ./finalize let the browser send
 * them straight to Google. Every request here requires a signed-in participant
 * of the conversation — the same rule the Supabase bucket's RLS enforces.
 */

const UUID = /^[0-9a-f-]{36}$/i;

/** Types a browser may show inline. Anything else (HTML, SVG, scripts…) is
 *  always a download, so an uploaded file can never run as part of the portal. */
const INLINE_SAFE = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "application/pdf", "video/mp4", "video/webm", "audio/mpeg", "audio/mp4", "audio/wav",
]);

export async function POST(request: NextRequest) {
  if (!driveConfigured()) return NextResponse.json({ error: "File storage is not configured." }, { status: 503 });
  const form = await request.formData();
  const conversationId = String(form.get("conversationId") ?? "");
  const file = form.get("file");
  if (!UUID.test(conversationId) || !(file instanceof File)) {
    return NextResponse.json({ error: "Bad upload." }, { status: 400 });
  }
  if (file.size > DIRECT_UPLOAD_BYTES) {
    return NextResponse.json({ error: "Large files upload straight to Drive. Please refresh and try again." }, { status: 413 });
  }
  const check = checkFile(file);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.reason === "too_large" ? 413 : 400 });

  const userId = await chatParticipant(conversationId);
  if (!userId) return NextResponse.json({ error: "You are not in this conversation." }, { status: 403 });

  try {
    const fileId = await uploadToDrive({
      name: file.name.slice(0, 200),
      mime: check.mime,
      bytes: Buffer.from(await file.arrayBuffer()),
      conversationId,
      uploadedBy: userId,
    });
    return NextResponse.json({ path: `${conversationId}/gdrive/${fileId}.${check.ext}` });
  } catch {
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 502 });
  }
}

export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get("path") ?? "";
  const match = path.match(/^([0-9a-f-]{36})\/gdrive\/([A-Za-z0-9_-]+)\.[a-z0-9]+$/i);
  if (!match || !driveConfigured()) return new NextResponse(null, { status: 404 });
  const [, conversationId, fileId] = match;

  if (!(await chatParticipant(conversationId))) return new NextResponse(null, { status: 403 });

  try {
    const file = await driveFileFor(fileId, conversationId);
    if (!file) return new NextResponse(null, { status: 404 });
    // Big files are never streamed through Vercel (it would use up the
    // monthly transfer allowance); send the member on to Google instead.
    if (file.size > DIRECT_UPLOAD_BYTES) return NextResponse.redirect(driveLinks(fileId).view, 302);

    const inline = INLINE_SAFE.has(file.mime) && request.nextUrl.searchParams.get("download") !== "1";
    const headers: Record<string, string> = {
      "content-type": inline ? file.mime : "application/octet-stream",
      "content-disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      // Files never change once uploaded; let the browser keep them.
      "cache-control": "private, max-age=86400, immutable",
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox; default-src 'none'; img-src 'self'; media-src 'self'",
    };
    if (file.size) headers["content-length"] = String(file.size);
    return new NextResponse(await downloadFromDrive(fileId), { headers });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
