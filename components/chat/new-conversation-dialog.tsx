"use client";

import { useMemo, useState } from "react";
import { startDirectMessage, createGroup } from "@/app/(dashboard)/chat/actions";
import { CloseIcon, SearchIcon, CheckIcon } from "@/components/icons";
import type { DirectoryEntry } from "@/components/chat/types";

/**
 * Modal for starting a conversation — either a direct message with one person
 * or a named group with several. On success it hands the new conversation id
 * back to the chat client, which selects it.
 */
export function NewConversationDialog({
  meId,
  directory,
  onClose,
  onOpenConversation,
}: {
  meId: string;
  directory: DirectoryEntry[];
  onClose: () => void;
  onOpenConversation: (conversationId: string) => void;
}) {
  const [tab, setTab] = useState<"direct" | "group">("direct");
  const [query, setQuery] = useState("");
  const [groupName, setGroupName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const people = useMemo(
    () =>
      directory
        .filter((p) => p.active && p.id !== meId)
        .filter((p) =>
          `${p.name} ${p.email}`.toLowerCase().includes(query.trim().toLowerCase()),
        ),
    [directory, meId, query],
  );

  async function openDirect(personId: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await startDirectMessage(personId);
    setBusy(false);
    if (res.ok && res.conversationId) {
      onOpenConversation(res.conversationId);
      onClose();
    } else {
      setError(res.error ?? "Could not start the chat.");
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function makeGroup() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await createGroup(groupName, [...selected]);
    setBusy(false);
    if (res.ok && res.conversationId) {
      onOpenConversation(res.conversationId);
      onClose();
    } else {
      setError(res.error ?? "Could not create the group.");
    }
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
          <h2 className="text-base font-semibold tracking-tight">New conversation</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-1 border-b px-3 py-2">
          {(["direct", "group"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTab(t);
                setError(null);
              }}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium capitalize transition ${
                tab === t
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent"
              }`}
            >
              {t === "direct" ? "Direct message" : "Group"}
            </button>
          ))}
        </div>

        {tab === "group" && (
          <div className="border-b px-5 py-3">
            <label className="text-sm font-medium" htmlFor="group_name">
              Group name
            </label>
            <input
              id="group_name"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="e.g. Influencer Team"
              className="mt-1.5 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        )}

        <div className="border-b px-5 py-3">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search people…"
              className="w-full rounded-xl border bg-background py-2 pl-9 pr-3 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>

        <ul className="flex-1 divide-y overflow-y-auto">
          {people.length === 0 && (
            <li className="px-5 py-8 text-center text-sm text-muted-foreground">
              No one matches “{query}”.
            </li>
          )}
          {people.map((p) => {
            const isSelected = selected.has(p.id);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => (tab === "direct" ? openDirect(p.id) : toggle(p.id))}
                  disabled={busy}
                  className="flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-accent disabled:opacity-60"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-primary">
                    {initials(p.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {p.email}
                    </span>
                  </span>
                  {tab === "group" && (
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-md border ${
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground/40"
                      }`}
                    >
                      {isSelected && <CheckIcon className="h-3.5 w-3.5" />}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        {error && (
          <p role="alert" className="border-t px-5 py-2 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        {tab === "group" && (
          <div className="flex items-center justify-between gap-3 border-t px-5 py-3">
            <span className="text-xs text-muted-foreground">
              {selected.size} selected
            </span>
            <button
              type="button"
              onClick={makeGroup}
              disabled={busy || !groupName.trim() || selected.size === 0}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Creating…" : "Create group"}
            </button>
          </div>
        )}
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
