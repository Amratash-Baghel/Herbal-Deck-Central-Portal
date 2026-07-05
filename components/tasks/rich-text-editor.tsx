"use client";

import { useEffect, useRef } from "react";

const TOOLS: { cmd: string; label: string; title: string; className?: string }[] = [
  { cmd: "bold", label: "B", title: "Bold", className: "font-bold" },
  { cmd: "italic", label: "I", title: "Italic", className: "italic" },
  { cmd: "underline", label: "U", title: "Underline", className: "underline" },
  { cmd: "strikeThrough", label: "S", title: "Strikethrough", className: "line-through" },
  { cmd: "insertUnorderedList", label: "• List", title: "Bullet list" },
  { cmd: "insertOrderedList", label: "1. List", title: "Numbered list" },
];

/**
 * Lightweight rich-text editor for task descriptions — a contentEditable with a
 * small formatting toolbar (bold / italic / underline / strikethrough / bullet /
 * numbered list) via document.execCommand. Emits raw HTML on every change; it's
 * sanitised to a strict allowlist on save (see lib/rich-text). Uncontrolled
 * (seeds once) so the caret never jumps.
 */
export function RichTextEditor({
  initialValue,
  onChange,
  placeholder,
}: {
  initialValue: string;
  onChange: (html: string) => void;
  placeholder?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.innerHTML = initialValue || "";
    // Seed once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function emit() {
    onChange(ref.current?.innerHTML ?? "");
  }

  function exec(cmd: string) {
    document.execCommand(cmd, false);
    ref.current?.focus();
    emit();
  }

  return (
    <div className="rounded-xl border bg-background">
      <div className="flex flex-wrap items-center gap-1 border-b px-2 py-1.5">
        {TOOLS.map((t) => (
          <button
            key={t.cmd}
            type="button"
            title={t.title}
            aria-label={t.title}
            onMouseDown={(e) => e.preventDefault()} // keep the selection
            onClick={() => exec(t.cmd)}
            className={`min-w-7 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition hover:bg-accent hover:text-foreground ${t.className ?? ""}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div
        ref={ref}
        contentEditable
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder}
        onInput={emit}
        className="rich-editor min-h-20 w-full resize-y px-3 py-2 text-sm outline-none"
      />
    </div>
  );
}
