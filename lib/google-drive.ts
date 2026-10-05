/**
 * Google Drive as file storage for chat attachments (optional; switched on by
 * NEXT_PUBLIC_CHAT_STORAGE=gdrive plus the three GOOGLE_* secrets below).
 *
 * The portal signs in to ONE Google account with an OAuth refresh token and
 * the `drive.file` scope. That scope only reaches files this app created
 * itself — Google enforces it — so nothing else already in that Drive can be
 * read, changed or deleted through the portal, even by a bug here.
 *
 * Files go into a single "Herbal Deck Portal" folder the app creates on first
 * use. Each file records its conversation in `appProperties`, which the
 * download route checks so a file can't be read through another chat.
 *
 * Plain fetch against the REST API — no googleapis dependency.
 */

const FOLDER_NAME = "Herbal Deck Portal";
const DRIVE = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";

export function driveConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN,
  );
}

// Reused across requests on a warm function instance.
let token: { value: string; expiresAt: number } | null = null;
let folderId: Promise<string> | null = null;

async function accessToken(): Promise<string> {
  if (token && token.expiresAt > Date.now() + 60_000) return token.value;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN ?? "",
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Google sign-in failed (${res.status}).`);
  const body = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return token.value;
}

async function drive(url: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: { ...init.headers, authorization: `Bearer ${await accessToken()}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Google Drive request failed (${res.status}).`);
  return res;
}

/** The app's folder — found (drive.file only lists app-created files) or created once. */
function portalFolder(): Promise<string> {
  folderId ??= (async () => {
    const q = `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const found = (await (await drive(`${DRIVE}/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`)).json()) as {
      files: { id: string }[];
    };
    if (found.files[0]) return found.files[0].id;
    const created = (await (
      await drive(`${DRIVE}/files?fields=id`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" }),
      })
    ).json()) as { id: string };
    return created.id;
  })().catch((e) => {
    folderId = null; // retry next time rather than caching a failure
    throw e;
  });
  return folderId;
}

/** Upload one file; returns its Drive file id. */
export async function uploadToDrive(opts: {
  name: string;
  mime: string;
  bytes: Buffer;
  conversationId: string;
  uploadedBy: string;
}): Promise<string> {
  const boundary = `hd-${crypto.randomUUID()}`;
  const metadata = {
    name: opts.name,
    parents: [await portalFolder()],
    appProperties: { conversationId: opts.conversationId, uploadedBy: opts.uploadedBy },
  };
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\ncontent-type: ${opts.mime}\r\n\r\n`,
    ),
    opts.bytes,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const res = await drive(`${UPLOAD}/files?uploadType=multipart&fields=id`, {
    method: "POST",
    headers: { "content-type": `multipart/related; boundary=${boundary}` },
    body,
  });
  return ((await res.json()) as { id: string }).id;
}

/** Fetch a file's bytes — only if it was uploaded for `conversationId`. */
export async function downloadFromDrive(
  fileId: string,
  conversationId: string,
): Promise<{ body: ReadableStream<Uint8Array> | null; mime: string; name: string } | null> {
  const meta = (await (
    await drive(`${DRIVE}/files/${encodeURIComponent(fileId)}?fields=name,mimeType,appProperties`)
  ).json()) as { name: string; mimeType: string; appProperties?: { conversationId?: string } };
  if (meta.appProperties?.conversationId !== conversationId) return null;
  const media = await drive(`${DRIVE}/files/${encodeURIComponent(fileId)}?alt=media`);
  return { body: media.body, mime: meta.mimeType, name: meta.name };
}
