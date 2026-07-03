import { avatarUrl, initialsOf } from "@/lib/avatar";

/**
 * A profile picture with an initials fallback. Presentational and framework-
 * agnostic (no hooks), so it works in both server and client components — used
 * in the sidebar, employee list, task cards, chat, and reviews.
 *
 * `className` sets the size/shape (e.g. "h-9 w-9 rounded-full") and is applied
 * to both the image and the fallback; `fallbackClassName` styles the initials
 * bubble (colours + text size).
 */
export function Avatar({
  name,
  path,
  url,
  className = "h-9 w-9 rounded-full",
  fallbackClassName = "bg-accent text-primary text-xs font-semibold",
}: {
  name: string;
  path?: string | null;
  url?: string | null;
  className?: string;
  fallbackClassName?: string;
}) {
  const src = url ?? avatarUrl(path);
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        className={`${className} shrink-0 object-cover`}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`${className} ${fallbackClassName} inline-flex shrink-0 items-center justify-center`}
    >
      {initialsOf(name)}
    </span>
  );
}
