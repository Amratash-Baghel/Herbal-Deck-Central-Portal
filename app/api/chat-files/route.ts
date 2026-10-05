import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkFile } from "@/lib/chat-attachments";
import { driveConfigured, uploadToDrive, downloadFromDrive } from "@/lib/google-drive";

/**
 * Chat attachments stored in Google Drive (see lib/google-drive.ts).
 *
 *   POST  form-data { conversationId, file }  → { path }
 *   GET   ?path=<conversationId>/gdrive/<fileId>.<ext>  → the file
 *
 * Both require a signed-in participant of that conversation — the same rule
 * the Supabase bucket's RLS enforces. Files ≤ 3 MB (checkFile), well inside
 * Vercel's 4.5 MB request limit, so they can pass through this route.
 */

async function participant(conversationId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return null;
  const { data: row } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("conversation_id", conversationId)
    .eq("profile_id", userId)
    .maybeSingle();
  return row ? userId : null;
}

const UUID = /^[0-9a-f-]{36}$/i;

export async function POST(request: NextRequest) {
  if (!driveConfigured()) return NextResponse.json({ error: "File storage is not configured." }, { status: 503 });
  const form = await request.formData();
  const conversationId = String(form.get("conversationId") ?? "");
  const file = form.get("file");
  if (!UUID.test(conversationId) || !(file instanceof File)) {
    return NextResponse.json({ error: "Bad upload." }, { status: 400 });
  }
  const check = checkFile(file);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.reason === "too_large" ? 413 : 400 });

  const userId = await participant(conversationId);
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

  if (!(await participant(conversationId))) return new NextResponse(null, { status: 403 });

  try {
    const file = await downloadFromDrive(fileId, conversationId);
    if (!file) return new NextResponse(null, { status: 404 });
    return new NextResponse(file.body, {
      headers: {
        "content-type": file.mime,
        "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        // Files never change once uploaded; let the browser keep them.
        "cache-control": "private, max-age=86400, immutable",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
