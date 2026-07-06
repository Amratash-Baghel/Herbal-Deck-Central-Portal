"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  SendIcon,
  AtIcon,
  PaperclipIcon,
  ImageIcon,
  FileIcon,
  CloseIcon,
  ExternalLinkIcon,
} from "@/components/icons";
import {
  checkFile,
  uploadChatAttachment,
  humanFileSize,
  ATTACHMENT_ACCEPT,
  type Attachment,
  type AttachmentKind,
} from "@/lib/chat-attachments";
import type { SendResult } from "@/app/(dashboard)/chat/actions";

export interface ComposerParticipant {
  id: string;
  name: string;
}

/** A file being (or already) uploaded, tracked locally in the composer. */
interface Pending {
  id: string;
  name: string;
  size: number;
  kind: AttachmentKind;
  status: "uploading" | "done" | "error";
  progress: number;
  result?: Attachment;
  error?: string;
}

/**
 * Message input with an @-mention picker and file attachments. Small files
 * (≤ 3 MB) upload directly to the private chat bucket with a live progress bar;
 * a larger file is rejected with a prompt to share it via Google Drive / Dropbox
 * instead. On send, only mentions whose "@Name" text is still present are
 * submitted, and only fully-uploaded attachments are attached.
 */
export function MessageComposer({
  conversationId,
  participants,
  onSend,
}: {
  conversationId: string;
  participants: ComposerParticipant[];
  onSend: (
    body: string,
    mentionIds: string[],
    attachments: Attachment[],
  ) => Promise<SendResult>;
}) {
  const [supabase] = useState(() => createClient());
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<Map<string, string>>(new Map());
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pending, setPending] = useState<Pending[]>([]);
  const [largeFile, setLargeFile] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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

  function update(id: string, patch: Partial<Pending>) {
    setPending((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  async function startUpload(file: File) {
    const check = checkFile(file);
    if (!check.ok) {
      if (check.reason === "too_large") setLargeFile(file.name);
      else setError(check.error);
      return;
    }
    setError(null);
    const localId = crypto.randomUUID();
    setPending((prev) => [
      ...prev,
      {
        id: localId,
        name: file.name,
        size: file.size,
        kind: check.kind,
        status: "uploading",
        progress: 0,
      },
    ]);

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      update(localId, { status: "error", error: "Please sign in again." });
      return;
    }
    try {
      const result = await uploadChatAttachment({
        conversationId,
        file,
        accessToken: token,
        ext: check.ext,
        mime: check.mime,
        kind: check.kind,
        onProgress: (pct) => update(localId, { progress: pct }),
      });
      update(localId, { status: "done", progress: 100, result });
    } catch (e) {
      update(localId, {
        status: "error",
        error: e instanceof Error ? e.message : "Upload failed.",
      });
    }
  }

  function onPickFiles(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files)) void startUpload(file);
    if (fileRef.current) fileRef.current.value = "";
  }

  function removePending(id: string) {
    const target = pending.find((p) => p.id === id);
    setPending((prev) => prev.filter((p) => p.id !== id));
    // Best-effort cleanup of an already-uploaded file that's being discarded.
    if (target?.result) {
      supabase.storage.from("chat-attachments").remove([target.result.path]).then(
        () => {},
        () => {},
      );
    }
  }

  const uploading = pending.some((p) => p.status === "uploading");
  const readyAttachments = pending
    .filter((p) => p.status === "done" && p.result)
    .map((p) => p.result as Attachment);
  const canSend =
    !sending && !uploading && (text.trim().length > 0 || readyAttachments.length > 0);

  async function send() {
    if (!canSend) return;
    const body = text.trim();
    const mentionIds = [...picked.entries()]
      .filter(([, name]) => text.includes(`@${name}`))
      .map(([id]) => id);

    setSending(true);
    setError(null);
    const res = await onSend(body, mentionIds, readyAttachments);
    setSending(false);
    if (res.ok) {
      setText("");
      setPicked(new Map());
      setMentionQuery(null);
      setPending([]);
      setLargeFile(null);
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

      {/* Large-file fallback: point the user at Drive / Dropbox */}
      {largeFile && (
        <div className="mb-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs dark:border-amber-900 dark:bg-amber-950/40">
          <p className="text-amber-800 dark:text-amber-200">
            <span className="font-medium">“{largeFile}”</span> is larger than 3MB.
            Please upload it to Google Drive or Dropbox and paste the share link
            instead.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <a
              href="https://drive.google.com/drive/my-drive"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 font-medium text-primary-foreground shadow-sm transition hover:opacity-90"
            >
              <ExternalLinkIcon className="h-3.5 w-3.5" />
              Open Google Drive
            </a>
            <a
              href="https://www.dropbox.com/home"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 font-medium transition hover:bg-accent"
            >
              <ExternalLinkIcon className="h-3.5 w-3.5" />
              Open Dropbox
            </a>
            <button
              type="button"
              onClick={() => setLargeFile(null)}
              className="ml-auto text-muted-foreground transition hover:text-foreground"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Pending / uploaded attachment chips */}
      {pending.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {pending.map((p) => (
            <div
              key={p.id}
              className="flex max-w-[15rem] items-center gap-2 rounded-lg border bg-background px-2 py-1.5 text-xs"
            >
              {p.kind === "image" ? (
                <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{p.name}</span>
                {p.status === "uploading" ? (
                  <span className="mt-1 flex items-center gap-1.5">
                    <span className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full bg-primary transition-all"
                        style={{ width: `${p.progress}%` }}
                      />
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {p.progress}%
                    </span>
                  </span>
                ) : p.status === "error" ? (
                  <span className="text-red-600 dark:text-red-400">{p.error}</span>
                ) : (
                  <span className="text-muted-foreground">
                    {humanFileSize(p.size)}
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => removePending(p.id)}
                aria-label={`Remove ${p.name}`}
                className="shrink-0 text-muted-foreground transition hover:text-foreground"
              >
                <CloseIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="mb-2 px-1 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <input
        ref={fileRef}
        type="file"
        multiple
        accept={ATTACHMENT_ACCEPT}
        onChange={(e) => onPickFiles(e.target.files)}
        className="hidden"
      />

      <div className="flex items-end gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          aria-label="Attach a file"
          title="Attach a file (max 3MB)"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border text-muted-foreground transition hover:bg-accent hover:text-foreground"
        >
          <PaperclipIcon className="h-[18px] w-[18px]" />
        </button>
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
          disabled={!canSend}
          aria-label="Send"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-50"
        >
          <SendIcon className="h-[18px] w-[18px]" />
        </button>
      </div>
    </div>
  );
}
