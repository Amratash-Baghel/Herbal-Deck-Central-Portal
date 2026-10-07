import { NextResponse, type NextRequest } from "next/server";
import { checkFile } from "@/lib/chat-attachments";
import { driveConfigured, startResumableUpload } from "@/lib/google-drive";
import { chatParticipant } from "../participant";

/**
 * Start a large upload: POST { conversationId, name, size, mime } → { uploadUrl }.
 * The browser then sends the file in chunks straight to that Google address.
 * Only a participant of the conversation can open a session for it.
 */
export async function POST(request: NextRequest) {
  if (!driveConfigured()) return NextResponse.json({ error: "File storage is not configured." }, { status: 503 });
  const body = (await request.json().catch(() => null)) as
    | { conversationId?: unknown; name?: unknown; size?: unknown; mime?: unknown }
    | null;
  const conversationId = typeof body?.conversationId === "string" ? body.conversationId : "";
  const name = typeof body?.name === "string" ? body.name.slice(0, 200) : "";
  const size = typeof body?.size === "number" ? body.size : NaN;
  if (!/^[0-9a-f-]{36}$/i.test(conversationId) || !name || !Number.isFinite(size) || size <= 0) {
    return NextResponse.json({ error: "Bad upload." }, { status: 400 });
  }
  const check = checkFile({ name, size, type: typeof body?.mime === "string" ? body.mime : "" });
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  const userId = await chatParticipant(conversationId);
  if (!userId) return NextResponse.json({ error: "You are not in this conversation." }, { status: 403 });

  try {
    const uploadUrl = await startResumableUpload({
      name,
      mime: check.mime,
      size,
      conversationId,
      uploadedBy: userId,
      origin: request.headers.get("origin") ?? request.nextUrl.origin,
    });
    return NextResponse.json({ uploadUrl });
  } catch {
    return NextResponse.json({ error: "Could not start the upload. Please try again." }, { status: 502 });
  }
}
