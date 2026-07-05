/**
 * Tiny, dependency-free rich-text sanitiser for task descriptions.
 *
 * The editor only produces basic inline formatting (bold / italic / underline /
 * strikethrough) and lists, so we keep a strict allowlist of tags and strip
 * EVERYTHING else — all attributes, all other tags (including <script>, <img>,
 * <a>, event handlers, styles). Whatever survives is safe to render with
 * dangerouslySetInnerHTML. Runs on the server (on save) so the stored value is
 * always clean, regardless of what the client sent.
 */

const ALLOWED = new Set([
  "b", "strong", "i", "em", "u", "s", "strike", "br", "p", "div",
  "ul", "ol", "li",
]);

// Normalise a couple of legacy tags the editor may emit.
const TAG_ALIAS: Record<string, string> = { strike: "s" };

export function sanitizeRichText(input: string | null | undefined): string {
  if (!input) return "";
  // Drop anything that looks like a script/style block outright, then rebuild
  // from the remaining tags using the allowlist (attributes always removed).
  const withoutBlocks = input
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .slice(0, 20000); // hard length cap

  const clean = withoutBlocks.replace(/<\/?([a-zA-Z0-9]+)[^>]*>/g, (_m, rawTag) => {
    const tag = String(rawTag).toLowerCase();
    if (!ALLOWED.has(tag)) return "";
    const canonical = TAG_ALIAS[tag] ?? tag;
    const closing = /^<\s*\//.test(_m) ? "/" : "";
    // Rebuild as a bare tag with no attributes.
    return `<${closing}${canonical}>`;
  });

  return clean.trim();
}

/**
 * Plain-text preview of rich content (for line-clamped card previews and any
 * place that shouldn't render markup). Strips tags and collapses whitespace.
 */
export function richTextToPlain(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/** True if the (sanitised) content actually contains formatting markup. */
export function hasMarkup(input: string | null | undefined): boolean {
  return Boolean(input && /<[a-z]/i.test(input));
}
