"use client";
/* eslint-disable @next/next/no-img-element -- Signed storage and Giphy URLs, not optimisable. */

import { useEffect, useReducer, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { GIF_BUCKET, MAX_ATTACHMENT_BYTES, humanFileSize } from "@/lib/chat-attachments";

type SavedGif = { path: string; url: string };
type FoundGif = { id: string; title: string; url: string; preview: string };

/** Pull a GIF down as a File, refusing anything over the attachment ceiling. */
async function fetchGif(url: string, name: string): Promise<File> {
  const blob = await fetch(url).then(r => r.blob());
  if (blob.size > MAX_ATTACHMENT_BYTES) throw new Error(`That GIF is ${humanFileSize(blob.size)}. The limit is 3 MB.`);
  return new File([blob], name, { type: "image/gif" });
}

/**
 * GIFs, from two places: search (proxied through /api/giphy so the key stays on
 * the server) and your own library.
 *
 * Saved GIFs live at `<your profile id>/<uuid>.gif` in a private bucket that
 * only you can read, write or delete (see migration 0027), so one is never
 * visible to anyone else until you send it — sending copies it into the
 * conversation like any other attachment.
 */
export function GifPicker({ supabase, meId, onPick, onPickUrl }: {
  supabase: SupabaseClient;
  meId: string;
  /** A GIF from your private library, attached as a file so others can see it. */
  onPick: (file: File) => void;
  /**
   * A Giphy result, sent as its public link. Giphy's CDN serves it to everyone,
   * so nothing is copied into our storage or counted against its bandwidth.
   */
  onPickUrl?: (url: string) => void;
}) {
  const [tab, setTab] = useState<"search" | "mine">("search");
  const [gifs, setGifs] = useState<SavedGif[] | null>(null);
  const [found, setFound] = useState<FoundGif[] | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const upload = useRef<HTMLInputElement>(null);
  const [version, reload] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    if (tab !== "mine") return;
    let alive = true;
    void (async () => {
      const { data, error } = await supabase.storage.from(GIF_BUCKET).list(meId, { limit: 100, sortBy: { column: "created_at", order: "desc" } });
      if (!alive) return;
      if (error) { setGifs([]); setError("Could not load your GIFs."); return; }
      const paths = (data ?? []).filter(o => o.name.toLowerCase().endsWith(".gif")).map(o => `${meId}/${o.name}`);
      if (!paths.length) { setGifs([]); return; }
      const signed = await supabase.storage.from(GIF_BUCKET).createSignedUrls(paths, 3600);
      if (!alive) return;
      setGifs((signed.data ?? []).flatMap(s => (s.signedUrl && s.path ? [{ path: s.path, url: s.signedUrl }] : [])));
    })();
    return () => { alive = false; };
  }, [supabase, meId, version, tab]);

  useEffect(() => {
    if (tab !== "search") return;
    let alive = true;
    const timer = setTimeout(() => void (async () => {
      const response = await fetch(`/api/giphy?q=${encodeURIComponent(query.trim())}`);
      if (!alive) return;
      if (!response.ok) { setFound([]); setError(response.status === 503 ? "GIF search isn't set up yet. Your own GIFs still work." : "Could not reach GIF search."); return; }
      const body = await response.json();
      if (!alive) return;
      setError("");
      setFound(body.gifs ?? []);
    })(), query ? 350 : 0);
    return () => { alive = false; clearTimeout(timer); };
  }, [query, tab]);

  async function save(file: File) {
    const { error } = await supabase.storage.from(GIF_BUCKET).upload(`${meId}/${crypto.randomUUID()}.gif`, file, { contentType: "image/gif", upsert: false });
    if (error) throw new Error("Could not save that GIF. Please try again.");
    reload();
  }

  /** Run one picker action, showing its message rather than throwing at the user. */
  async function act(work: () => Promise<void>) {
    setError("");
    setBusy(true);
    try { await work(); }
    catch (thrown) { setError(thrown instanceof Error ? thrown.message : "Something went wrong."); }
    finally { setBusy(false); }
  }

  const grid = tab === "mine"
    ? gifs?.map(gif => <span key={gif.path}>
        <button type="button" disabled={busy} aria-label="Send this GIF" onClick={() => void act(async () => onPick(await fetchGif(gif.url, gif.path.split("/").pop() || "saved.gif")))}><img src={gif.url} alt=""/></button>
        <button type="button" className="cp-gif-remove" disabled={busy} aria-label="Delete this GIF" onClick={() => void act(async () => {
          const { error } = await supabase.storage.from(GIF_BUCKET).remove([gif.path]);
          if (error) throw new Error("Could not delete that GIF.");
          setGifs(list => (list ?? []).filter(g => g.path !== gif.path));
        })}>×</button>
      </span>)
    : found?.map(gif => <span key={gif.id}>
        <button type="button" disabled={busy} aria-label={gif.title ? `Send ${gif.title}` : "Send this GIF"} onClick={() => void act(async () => (onPickUrl ? onPickUrl(gif.url) : onPick(await fetchGif(gif.url, "giphy.gif"))))}><img src={gif.preview} alt={gif.title} loading="lazy"/></button>
        <button type="button" className="cp-gif-save" disabled={busy} aria-label="Save to my GIFs" title="Save to my GIFs" onClick={() => void act(async () => save(await fetchGif(gif.url, "giphy.gif")))}>+</button>
      </span>);

  return <div className="cp-gif">
    <div className="cp-gif-tabs">
      <button type="button" className={tab === "search" ? "is-active" : ""} onClick={() => { setTab("search"); setError(""); }}>Search</button>
      <button type="button" className={tab === "mine" ? "is-active" : ""} onClick={() => { setTab("mine"); setError(""); }}>My GIFs</button>
    </div>

    {tab === "search"
      ? <input className="cp-gif-search" type="search" value={query} placeholder="Search GIFs…" aria-label="Search GIFs" onChange={e => setQuery(e.target.value)}/>
      : <>
          <input ref={upload} type="file" accept=".gif,image/gif" hidden onChange={e => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void act(async () => {
              if (!file.name.toLowerCase().endsWith(".gif")) throw new Error("Only GIF files can be saved here.");
              if (file.size > MAX_ATTACHMENT_BYTES) throw new Error(`That GIF is ${humanFileSize(file.size)}. The limit is 3 MB.`);
              await save(file);
            });
          }}/>
          <button type="button" className="cp-gif-add" disabled={busy} onClick={() => upload.current?.click()}>Upload a GIF (max 3 MB)</button>
        </>}

    {error && <p className="cp-gif-error" role="alert">{error}</p>}
    {(tab === "mine" ? gifs : found) === null && <p className="cp-gif-note" role="status">Loading…</p>}
    {tab === "mine" && gifs?.length === 0 && !error && <p className="cp-gif-note">Your saved GIFs stay private to you. Upload one to reuse it any time.</p>}
    {tab === "search" && found?.length === 0 && !error && <p className="cp-gif-note">No GIFs found.</p>}
    {!!grid?.length && <div className="cp-gif-grid">{grid}</div>}
  </div>;
}
