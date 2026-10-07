import { NextResponse, type NextRequest } from "next/server";
import { extOf } from "@/lib/chat-attachments";
import { driveConfigured, shareUploadedFile } from "@/lib/google-drive";
import { chatParticipant } from "../participant";

/**
 * Finish a large upload: POST { conversationId, fileId } → { path, name, size, mime }.
 * Confirms the file in Drive was uploaded by this user for this chat, then
 * turns on its secret link so chat members can open it from Google.
 */
export async function POST(request: NextRequest) {
  if (!driveConfigured()) return NextResponse.json({ error: "File storage is not configured." }, { status: 503 });
  const body = (await request.json().catch(() => null)) as { conversationId?: unknown; fileId?: unknown } | null;
  const conversationId = typeof body?.conversationId === "string" ? body.conversationId : "";
  const fileId = typeof body?.fileId === "string" ? body.fileId : "";
  if (!/^[0-9a-f-]{36}$/i.test(conversationId) || !/^[A-Za-z0-9_-]{10,200}$/.test(fileId)) {
    return NextResponse.json({ error: "Bad upload." }, { status: 400 });
  }

  const userId = await chatParticipant(conversationId);
  if (!userId) return NextResponse.json({ error: "You are not in this conversation." }, { status: 403 });

  try {
    const file = await shareUploadedFile(fileId, conversationId, userId);
    if (!file) return NextResponse.json({ error: "That upload doesn't belong to this chat." }, { status: 403 });
    const ext = extOf(file.name);
    const safeExt = /^[a-z0-9]{1,10}$/.test(ext) ? ext : "bin";
    return NextResponse.json({
      path: `${conversationId}/gdrive/${fileId}.${safeExt}`,
      name: file.name,
      size: file.size,
      mime: file.mime,
    });
  } catch {
    return NextResponse.json({ error: "Upload finished, but the file couldn't be shared. Please try again." }, { status: 502 });
  }
}
