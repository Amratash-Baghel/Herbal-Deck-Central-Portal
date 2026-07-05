import { sanitizeRichText, hasMarkup } from "@/lib/rich-text";

/**
 * Renders a task's rich description safely. The value is sanitised again here
 * (belt-and-braces with the server-side sanitise on save), so only the
 * allowlisted formatting tags ever reach the DOM. Plain-text descriptions
 * (no markup) render as-is.
 */
export function RichText({
  html,
  className = "",
}: {
  html: string | null | undefined;
  className?: string;
}) {
  if (!html) return null;
  if (!hasMarkup(html)) {
    return <div className={className}>{html}</div>;
  }
  const clean = sanitizeRichText(html);
  return (
    <div
      className={`rich-text ${className}`}
      // Safe: `clean` is an allowlist-sanitised subset (basic formatting only).
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
