/**
 * Shrink a photo in the browser before it is uploaded.
 *
 * Phone photos are usually 3–8 MB at 4000px or more — far beyond what a chat
 * thread or an avatar ever displays. Every stored byte counts against the
 * storage quota, and every view counts against egress, so an image is resized
 * to at most `maxEdge` pixels on its long side and re-encoded as JPEG.
 *
 * Deliberately conservative:
 *   - GIFs are left alone (re-encoding would drop the animation).
 *   - Anything that isn't a decodable JPG/PNG is returned untouched.
 *   - Small images that are already within bounds are returned untouched.
 *   - If the re-encoded file isn't actually smaller, the original is kept.
 * So the worst case is exactly today's behaviour.
 */
export async function shrinkImage(
  file: File,
  { maxEdge = 1600, quality = 0.85, skipUnderBytes = 300 * 1024 } = {},
): Promise<File> {
  const type = file.type.toLowerCase();
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  const isPhoto = type === "image/jpeg" || type === "image/png" || ["jpg", "jpeg", "png"].includes(ext);
  if (!isPhoto || typeof createImageBitmap !== "function") return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file; // Not decodable here — let the normal checks handle it.
  }

  try {
    const longEdge = Math.max(bitmap.width, bitmap.height);
    if (file.size <= skipUnderBytes && longEdge <= maxEdge) return file;

    const scale = Math.min(1, maxEdge / longEdge);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    // JPEG has no transparency: paint white first so a transparent PNG doesn't
    // turn black.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return file;

    const base = file.name.replace(/\.[^.]+$/, "") || "image";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg", lastModified: file.lastModified });
  } finally {
    bitmap.close();
  }
}
