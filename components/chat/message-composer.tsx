"use client";

import { useRef, useState } from "react";
import { SendIcon, AtIcon } from "@/components/icons";
import type { SendResult } from "@/app/(dashboard)/chat/actions";

export interface ComposerParticipant {
  id: string;
  name: string;
}

/**
 * Message input with an @-mention picker. Typing "@" surfaces the conversation's
 * members; choosing one inserts "@Name " and records the ping. On send, only
 * mentions whose "@Name" text is still present are submitted, so editing the
 * draft keeps the pings honest.
 */
export function MessageComposer({
  participants,
  onSend,
}: {
  participants: ComposerParticipant[];
  onSend: (body: string, mentionIds: string[]) => Promise<SendResult>;
}) {
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<Map<string, string>>(new Map());
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  const suggestions =
    mentionQuery === null
      ? []
      : participants
          .filter((p) =>
            p.name.toLowerCase().includes(mentionQuery.toLowerCase()),
          )
          .slice(0, 6);

  function syncMentionState(value: string, caret: number) {
    const before = value.slice(0, caret);
    const m = before.match(/(^|\s)@(\w*)$/);
    setMentionQuery(m ? m[2] : null);
  }

  function pick(p: ComposerParticipant) {
    const el = ref.current;
    const caret = el?.selectionStart ?? text.length;
    const before = text.slice(0, caret).replace(/(^|\s)@(\w*)$/, `$1@${p.name} `);
    const after = text.slice(caret);
    const next = before + after;
    setText(next);
    setPicked((prev) => new Map(prev).set(p.id, p.name));
    setMentionQuery(null);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(before.length, before.length);
    });
  }

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    const mentionIds = [...picked.entries()]
      .filter(([, name]) => text.includes(`@${name}`))
      .map(([id]) => id);

    setSending(true);
    setError(null);
    const res = await onSend(body, mentionIds);
    setSending(false);
    if (res.ok) {
      setText("");
      setPicked(new Map());
      setMentionQuery(null);
    } else {
      setError(res.error ?? "Could not send.");
    }
  }

  return (
    <div className="relative border-t p-3">
      {suggestions.length > 0 && (
        <ul className="absolute bottom-[calc(100%-0.25rem)] left-3 z-10 w-64 overflow-hidden rounded-xl border bg-card shadow-lg">
          {suggestions.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(p);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-accent"
              >
                <AtIcon className="h-4 w-4 text-muted-foreground" />
                {p.name}
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="mb-2 px-1 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="flex items-end gap-2">
        <textarea
          ref={ref}
          value={text}
          rows={1}
          onChange={(e) => {
            setText(e.target.value);
            syncMentionState(e.target.value, e.target.selectionStart ?? 0);
          }}
          onKeyUp={(e) =>
            syncMentionState(
              (e.target as HTMLTextAreaElement).value,
              (e.target as HTMLTextAreaElement).selectionStart ?? 0,
            )
          }
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="Write a message…  (@ to mention, Enter to send)"
          className="max-h-40 min-h-[2.75rem] flex-1 resize-y rounded-xl border bg-background px-3 py-2.5 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={sending || !text.trim()}
          aria-label="Send"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-50"
        >
          <SendIcon className="h-[18px] w-[18px]" />
        </button>
      </div>
    </div>
  );
}
