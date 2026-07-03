/**
 * Build the public URL for a profile picture stored in the `avatars` bucket.
 * The bucket is public, so this is a plain, cacheable URL (no signing). The
 * stored path is timestamped, so replacing a photo yields a new URL and avoids
 * stale caches. Returns null when there's no avatar.
 */
export function avatarUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/avatars/${path}`;
}

/** Up-to-two-letter initials from a name/email, for the avatar fallback. */
export function initialsOf(name: string): string {
  return name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}
