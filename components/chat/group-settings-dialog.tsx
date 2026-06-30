"use client";

import { useMemo, useState } from "react";
import {
  renameGroup,
  addGroupMembers,
  removeGroupMember,
  leaveGroup,
} from "@/app/(dashboard)/chat/actions";
import { CloseIcon, CheckIcon, PlusIcon, UserMinusIcon } from "@/components/icons";
import type { DirectoryEntry, ConversationSummary } from "@/components/chat/types";

/**
 * Group management modal. Admins can rename the group and add/remove members;
 * anyone can leave. Each successful change asks the chat client to refresh the
 * conversation so names and the roster stay in sync.
 */
export function GroupSettingsDialog({
  conversation,
  directory,
  meId,
  onClose,
  onChanged,
  onLeft,
}: {
  conversation: ConversationSummary;
  directory: DirectoryEntry[];
  meId: string;
  onClose: () => void;
  onChanged: () => void;
  onLeft: () => void;
}) {
  const nameOf = useMemo(() => {
    const map = new Map(directory.map((d) => [d.id, d.name]));
    return (id: string) => map.get(id) ?? "Unknown";
  }, [directory]);

  const [name, setName] = useState(conversation.name ?? "");
  const [adding, setAdding] = useState(false);
  const [toAdd, setToAdd] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amAdmin = conversation.amAdmin;
  const members = conversation.participantIds;

  const candidates = useMemo(
    () =>
      directory.filter((d) => d.active && !members.includes(d.id) && d.id !== meId),
    [directory, members, meId],
  );

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, after: () => void) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await fn();
    setBusy(false);
    if (res.ok) after();
    else setError(res.error ?? "Something went wrong.");
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <div className="relative z-10 flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-base font-semibold tracking-tight">Group settings</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Rename */}
          <div className="border-b px-5 py-4">
            <label className="text-sm font-medium" htmlFor="rename">
              Group name
            </label>
            <div className="mt-1.5 flex gap-2">
              <input
                id="rename"
                value={name}
                disabled={!amAdmin}
                onChange={(e) => setName(e.target.value)}
                className="flex-1 rounded-xl border bg-background px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              />
              {amAdmin && (
                <button
                  type="button"
                  onClick={() =>
                    run(
                      () => renameGroup(conversation.id, name),
                      () => onChanged(),
                    )
                  }
                  disabled={busy || !name.trim() || name.trim() === conversation.name}
                  className="rounded-xl border px-3 py-2 text-sm font-medium transition hover:bg-accent disabled:opacity-50"
                >
                  Save
                </button>
              )}
            </div>
          </div>

          {/* Members */}
          <div className="px-5 py-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">
                Members{" "}
                <span className="text-muted-foreground">({members.length})</span>
              </p>
              {amAdmin && (
                <button
                  type="button"
                  onClick={() => setAdding((v) => !v)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary transition hover:underline"
                >
                  <PlusIcon className="h-3.5 w-3.5" />
                  Add
                </button>
              )}
            </div>

            {adding && (
              <div className="mt-3 rounded-xl border">
                <ul className="max-h-44 divide-y overflow-y-auto">
                  {candidates.length === 0 && (
                    <li className="px-3 py-4 text-center text-xs text-muted-foreground">
                      Everyone is already in this group.
                    </li>
                  )}
                  {candidates.map((c) => {
                    const sel = toAdd.has(c.id);
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() =>
                            setToAdd((prev) => {
                              const next = new Set(prev);
                              if (next.has(c.id)) next.delete(c.id);
                              else next.add(c.id);
                              return next;
                            })
                          }
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-accent"
                        >
                          <span
                            className={`flex h-5 w-5 items-center justify-center rounded-md border ${
                              sel
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-muted-foreground/40"
                            }`}
                          >
                            {sel && <CheckIcon className="h-3.5 w-3.5" />}
                          </span>
                          <span className="truncate">{c.name}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <div className="flex justify-end border-t px-3 py-2">
                  <button
                    type="button"
                    onClick={() =>
                      run(
                        () => addGroupMembers(conversation.id, [...toAdd]),
                        () => {
                          setToAdd(new Set());
                          setAdding(false);
                          onChanged();
                        },
                      )
                    }
                    disabled={busy || toAdd.size === 0}
                    className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
                  >
                    Add {toAdd.size > 0 ? toAdd.size : ""}
                  </button>
                </div>
              </div>
            )}

            <ul className="mt-3 space-y-1">
              {members.map((id) => (
                <li
                  key={id}
                  className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-accent/60"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-primary">
                    {initials(nameOf(id))}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {nameOf(id)}
                    {id === meId && (
                      <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                    )}
                  </span>
                  {amAdmin && id !== meId && (
                    <button
                      type="button"
                      onClick={() =>
                        run(
                          () => removeGroupMember(conversation.id, id),
                          () => onChanged(),
                        )
                      }
                      aria-label={`Remove ${nameOf(id)}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition hover:text-red-600"
                    >
                      <UserMinusIcon className="h-3.5 w-3.5" />
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {error && (
          <p role="alert" className="border-t px-5 py-2 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <div className="border-t px-5 py-3">
          <button
            type="button"
            onClick={() =>
              run(
                () => leaveGroup(conversation.id),
                () => onLeft(),
              )
            }
            disabled={busy}
            className="text-sm font-medium text-red-600 transition hover:underline disabled:opacity-50 dark:text-red-400"
          >
            Leave group
          </button>
        </div>
      </div>
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}
