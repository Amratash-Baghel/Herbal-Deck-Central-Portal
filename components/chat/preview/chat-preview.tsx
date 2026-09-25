"use client";
/* eslint-disable @next/next/no-img-element -- Local object URLs need no image optimization server. */

import { Fragment, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { MessageAttachments } from "../message-attachments";
import { LinkPreviewCards } from "../link-preview";
import { ThemeToggle } from "@/components/theme-toggle";
import { MessageActionPopover } from "../message-actions";
import { ChatAvatar } from "../chat-avatar";
import { GROUP_BADGES, BADGE_LABELS, GroupBadge, type GroupBadgeName } from "../group-badges";
import { canGroup, isNearBottom, mergeMessages } from "../chat-model";
import { detectShareLinks, checkFile, ATTACHMENT_ACCEPT, MAX_ATTACHMENTS_PER_MESSAGE } from "@/lib/chat-attachments";
import type { Message } from "@/lib/types";
import type { ConversationSummary, DirectoryEntry } from "../types";
import "../chat-base.css";
import "../chat.css";

type Person = DirectoryEntry & { color?: string | null; avatarPath?: string | null; post?: string | null };
type LocalFile = { name: string; mime: string; size: number; url: string };
type PreviewMessage = Message & { reply?: string; edited?: boolean; deleted?: boolean; reactions?: string[]; pinned?: boolean; local?: boolean; files?: LocalFile[] };
type Store = { drafts: Record<string, string>; messages: Record<string, PreviewMessage[]>; conversations: ConversationSummary[]; badges?: Record<string, GroupBadgeName>; sample?: PreviewMessage[] };
const EMPTY: Store = { drafts: {}, messages: {}, conversations: [] };
const DEMO = "local-design-room";
const EMOJI = ["👍", "❤️", "🎉", "👀", "✅", "🙏"];
const clock = (date: string) => new Date(date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const day = (date: string) => new Date(date).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
const paths: Record<string, ReactNode> = {
  search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></>,
  plus: <path d="M12 5v14M5 12h14"/>, back: <path d="m14 5-7 7 7 7"/>, close: <path d="m6 6 12 12M18 6 6 18"/>,
  info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/></>,
  pin: <><path d="m8 3 8 0-1 6 4 4H5l4-4-1-6ZM12 13v8"/></>,
  chat: <path d="M21 11a9 9 0 0 1-9 9H4l-2 2V11a9 9 0 0 1 19 0Z"/>,
  send: <path d="m3 3 19 9-19 9 4-9-4-9Zm4 9h15"/>,
  attach: <path d="m9 13 6-6a3 3 0 0 1 4 4l-8 8a5 5 0 0 1-7-7l8-8M7 15l8-8"/>,
  more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
  reply: <path d="m9 4-6 6 6 6M3 10h10a7 7 0 0 1 7 7v3"/>,
  check: <path d="m5 12 4 4L19 6"/>, down: <path d="m6 9 6 6 6-6"/>,
  people: <><circle cx="9" cy="8" r="3"/><path d="M2 21v-3a7 7 0 0 1 14 0v3M17 5a3 3 0 0 1 0 6M19 15a5 5 0 0 1 3 5"/></>,
  file: <path d="M5 2h9l5 5v15H5V2Zm9 0v6h5M8 13h8M8 17h6"/>,
};
function Icon({ name }: { name: string }) { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.chat}</svg>; }
function Tool({ label, icon, onClick, active }: { label: string; icon: string; onClick: () => void; active?: boolean }) { return <button type="button" className={`cp-tool ${active ? "is-active" : ""}`} title={label} aria-label={label} aria-pressed={active} onClick={onClick}><Icon name={icon}/></button>; }

function sampleMessages(me: string): PreviewMessage[] {
  const start = Date.now() - 8 * 60_000;
  return [
    { sender: "sample-neha", body: "A little more room for good conversations.", offset: 0 },
    { sender: "sample-neha", body: "Here’s our space to try the new chat. Replies, reactions and pinned decisions live right beside the conversation.", offset: 30_000 },
    { sender: me, body: "Love the calmer layout. Let’s keep the important things easy to find.", offset: 90_000 },
    { sender: "sample-arjun", body: "Agreed. I’ve pinned the review checklist so we can come back to it.", offset: 140_000 },
    { sender: "sample-arjun", body: "Review checklist\n• Try a reply and a reaction\n• Search without losing your place\n• Drop a file into the composer\n• Switch themes and try a narrow screen", offset: 150_000 },
    { sender: "sample-neha", body: "Your turn. Send a test message below — it stays in this browser.", offset: 190_000 },
  ].map((m, i) => ({ id: `sample-${i}`, conversation_id: DEMO, sender_id: m.sender, body: m.body, mentions: [], attachments: [], created_at: new Date(start + m.offset).toISOString(), pinned: i === 4, reactions: i === 2 ? ["👍", "✅"] : [], local: true }));
}

export function ChatPreview({ me, directory, conversations, initialConversationId }: { me: { id: string; name: string }; directory: Person[]; conversations: ConversationSummary[]; initialConversationId?: string }) {
  const [supabase] = useState(() => createClient());
  const [store, setStore] = useState<Store>(EMPTY);
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState(initialConversationId || DEMO);
  const [mobileThread, setMobileThread] = useState(Boolean(initialConversationId));
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [base, setBase] = useState<PreviewMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  const [panel, setPanel] = useState<"info" | "pins" | "search" | "new" | null>(null);
  const [threadQuery, setThreadQuery] = useState("");
  const [reply, setReply] = useState<PreviewMessage | null>(null);
  const [editing, setEditing] = useState<PreviewMessage | null>(null);
  const [editText, setEditText] = useState("");
  const [menu, setMenu] = useState<string | null>(null);
  const [files, setFiles] = useState<LocalFile[]>([]);
  const [notice, setNotice] = useState("");
  const [away, setAway] = useState(false);
  const [offline, setOffline] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [newQuery, setNewQuery] = useState("");
  const [groupName, setGroupName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [rename, setRename] = useState("");
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [matchIndex, setMatchIndex] = useState(0);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [storageError, setStorageError] = useState(false);
  const [now, setNow] = useState(0);
  const thread = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const longPress = useRef<{ x: number; y: number; timer: ReturnType<typeof setTimeout> } | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const upload = useRef<HTMLInputElement>(null);
  const scrollBottom = useRef(true);
  const objectUrls = useRef<string[]>([]);
  const storeKey = `herbal-chat-design-v1:${me.id}`;
  const people: Person[] = [...directory, { id: "sample-neha", name: "Neha Rao", email: "", active: true, color: "#926345" }, { id: "sample-arjun", name: "Arjun Mehta", email: "", active: true, color: "#526cac" }];
  const person = (id: string) => people.find(p => p.id === id);
  const name = (id: string) => id === me.id ? me.name : person(id)?.name || "Former employee";
  const demo: ConversationSummary = { id: DEMO, type: "group", name: "The design room", participantIds: [me.id, "sample-neha", "sample-arjun"], amAdmin: true, unread: 0, lastMessageAt: null, lastMessagePreview: "A space to try the new chat" };
  const overrides = new Map(store.conversations.map(c => [c.id, c]));
  const all = [demo, ...conversations].map(c => overrides.get(c.id) || c).concat(store.conversations.filter(c => c.id !== DEMO && !conversations.some(x => x.id === c.id)));
  const current = all.find(c => c.id === selected) || demo;
  const title = (c: ConversationSummary) => c.type === "group" ? c.name || "Group" : name(c.participantIds.find(id => id !== me.id) || me.id);
  const locals = store.messages[selected] || [];
  const merged = mergeMessages(base, locals);
  const draft = store.drafts[selected] || "";
  const text = editing ? editText : draft;
  const pinned = merged.filter(m => m.pinned && !m.deleted);
  const hits = threadQuery.trim() ? merged.filter(m => !m.deleted && m.body.toLowerCase().includes(threadQuery.trim().toLowerCase())) : [];
  const visible = all.filter(c => (filter !== "Unread" || c.unread > 0) && (filter !== "Groups" || c.type === "group") && title(c).toLowerCase().includes(query.toLowerCase()));
  const mentionTerm = text.match(/(?:^|\s)@([^@\n]*)$/)?.[1];
  const suggestions = mentionOpen && mentionTerm !== undefined ? current.participantIds.filter(id => id !== me.id && name(id).toLowerCase().includes(mentionTerm.toLowerCase())).slice(0, 5) : [];

  useEffect(() => {
    let value = EMPTY;
    try { const raw = sessionStorage.getItem(storeKey); if (raw) value = JSON.parse(raw); } catch { /* A fresh sandbox is safe if browser storage is unavailable. */ }
    // Object URLs only live for one document; never restore broken attachments.
    value = { ...value, messages: Object.fromEntries(Object.entries(value.messages || {}).map(([id, ms]) => [id, ms.map(m => ({ ...m, files: m.files?.map(f => ({ ...f, url: "" })) }))])) };
    queueMicrotask(() => { setStore({ ...value, sample: value.sample || sampleMessages(me.id) }); setReady(true); });
  }, [storeKey, me.id]);
  useEffect(() => {
    if (!ready) return;
    try { sessionStorage.setItem(storeKey, JSON.stringify(store)); } catch { queueMicrotask(() => setStorageError(true)); }
  }, [store, ready, storeKey]);
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    scrollBottom.current = true;
    const run = async () => {
      setLoading(true); setLoadError(""); setBase([]);
      if (selected.startsWith("local-")) { setBase(selected === DEMO ? store.sample || [] : []); setLoading(false); return; }
      const { data, error } = await supabase.from("messages").select("*").eq("conversation_id", selected).order("created_at", { ascending: false }).limit(300);
      if (cancelled) return;
      setBase((data || []).reverse() as PreviewMessage[]); setLoading(false);
      if (error) setLoadError("We couldn’t load this conversation. Your local draft is safe.");
    };
    void run();
    return () => { cancelled = true; };
  }, [selected, supabase, retry, ready, store.sample]);
  useEffect(() => {
    if (scrollBottom.current && thread.current) thread.current.scrollTop = thread.current.scrollHeight;
  }, [base, store.messages, selected]);
  useEffect(() => {
    if (input.current) { input.current.style.height = "auto"; input.current.style.height = `${Math.min(input.current.scrollHeight, 160)}px`; }
  }, [text]);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    queueMicrotask(tick);
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    const urls = objectUrls.current;
    queueMicrotask(update); window.addEventListener("online", update); window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); urls.forEach(url => URL.revokeObjectURL(url)); };
  }, []);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(""), 4000); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") { setPanel(null); setMenu(null); setReply(null); setEditing(null); } };
    window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close);
  }, []);

  useEffect(() => {
    const el = thread.current;
    if (!el) return;
    const observer = new ResizeObserver(() => { if (scrollBottom.current) el.scrollTop = el.scrollHeight; });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const el = panelRef.current;
    if (!panel || !el) return;
    const previous = document.activeElement as HTMLElement | null;
    const workspace = el.closest(".cp-workspace");
    const modal = (workspace?.getBoundingClientRect().width || 0) < 1150;
    el.setAttribute("role", modal ? "dialog" : "complementary");
    if (modal) el.setAttribute("aria-modal", "true"); else el.removeAttribute("aria-modal");
    const siblings = modal ? Array.from(el.parentElement?.children || []).filter(child => child !== el) as HTMLElement[] : [];
    const list = modal ? workspace?.querySelector<HTMLElement>(".cp-list") : null;
    siblings.forEach(child => { child.inert = true; });
    if (list) list.inert = true;
    const controls = () => Array.from(el.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),a[href],textarea,select')).filter(node => node.getClientRects().length > 0);
    const preferred = el.querySelector<HTMLElement>('input[autofocus]') || controls()[0];
    preferred?.focus();
    const trap = (event: KeyboardEvent) => {
      if (!modal || event.key !== "Tab") return;
      const items = controls(); const first = items[0]; const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    el.addEventListener("keydown", trap);
    return () => { el.removeEventListener("keydown", trap); siblings.forEach(child => { child.inert = false; }); if (list) list.inert = false; previous?.focus({ preventScroll:true }); };
  }, [panel]);
  function cancelLongPress() { if (longPress.current) clearTimeout(longPress.current.timer); longPress.current = null; }
  function avatar(id: string, group = false, size: "row" | "header" | "message" | "detail" = "row") {
    const p = person(id);
    return <ChatAvatar id={id} name={name(id)} kind={group ? "group" : "person"} avatarPath={p?.avatarPath} color={p?.color} size={size} badge={store.badges?.[id] || (id === DEMO ? "layers" : undefined)}/>;
  }
  function setText(value: string) { if (editing) setEditText(value); else setStore(s => ({ ...s, drafts: { ...s.drafts, [selected]: value } })); setMentionOpen(true); setMentionIndex(0); }
  function open(id: string) {
    setSelected(id); setMobileThread(true); setReply(null); setEditing(null); setMenu(null); setPanel(null); setThreadQuery(""); setFiles([]); setAway(false);
    window.history.replaceState(null, "", `${window.location.pathname}?c=${encodeURIComponent(id)}`);
    const conversation = all.find(c => c.id === id);
    if (conversation?.unread) setStore(s => ({ ...s, conversations: [...s.conversations.filter(c => c.id !== id), { ...conversation, unread: 0 }] }));
  }
  function patchMessage(message: PreviewMessage, patch: Partial<PreviewMessage>) {
    setStore(s => ({ ...s, messages: { ...s.messages, [selected]: [...(s.messages[selected] || []).filter(m => m.id !== message.id), { ...message, ...patch }] } }));
  }
  function send() {
    if ((!text.trim() && !files.length) || loading || !ready) return;
    if (text.trim().length > 4000) { setNotice("Messages can contain up to 4,000 characters."); return; }
    if (editing) {
      if (now - Date.parse(editing.created_at) > 900_000) { setNotice("The 15-minute edit window has ended."); return; }
      patchMessage(editing, { body: text.trim(), edited: true }); setEditing(null); setEditText("");
    } else {
      const message: PreviewMessage = { id: crypto.randomUUID(), conversation_id: selected, sender_id: me.id, body: text.trim(), mentions: current.participantIds.filter(id => text.includes(`@${name(id)}`)), attachments: [], created_at: new Date().toISOString(), local: true, reply: reply?.id, files };
      setStore(s => ({ ...s, drafts: { ...s.drafts, [selected]: "" }, messages: { ...s.messages, [selected]: [...(s.messages[selected] || []), message] } }));
      setReply(null); setFiles([]);
    }
    scrollBottom.current = true; setAway(false); input.current?.focus();
  }
  function attach(list: FileList | File[]) {
    const incoming = Array.from(list);
    if (files.length + incoming.length > MAX_ATTACHMENTS_PER_MESSAGE) { setNotice("You can attach up to six files per message."); return; }
    const invalid = incoming.map(file => ({ file, result: checkFile(file) })).find(({ result }) => !result.ok);
    if (invalid && !invalid.result.ok) { setNotice(invalid.result.error); return; }
    const accepted = incoming.map(file => {
      const check = checkFile(file);
      const url = URL.createObjectURL(file); objectUrls.current.push(url);
      return { name: file.name, mime: check.ok ? check.mime : file.type, size: file.size, url };
    });
    setFiles(prev => [...prev, ...accepted]);
  }
  function jump(id: string, close = true) {
    if (close) setPanel(null); setHighlight(id); scrollBottom.current = false;
    requestAnimationFrame(() => document.getElementById(`message-${id}`)?.scrollIntoView({ block: "center", behavior: "smooth" }));
  }
  function startConversation() {
    if (!picked.length || (picked.length > 1 && !groupName.trim())) return;
    const existing = picked.length === 1 ? all.find(c => c.type === "dm" && c.participantIds.includes(picked[0])) : null;
    if (existing) { open(existing.id); return; }
    const id = `local-${crypto.randomUUID()}`;
    const c: ConversationSummary = { id, type: picked.length > 1 ? "group" : "dm", name: picked.length > 1 ? groupName.trim() : null, participantIds: [me.id, ...picked], amAdmin: true, unread: 0, lastMessageAt: null, lastMessagePreview: "New local conversation" };
    setStore(s => ({ ...s, conversations: [...s.conversations, c] })); open(id); setPicked([]); setGroupName("");
  }
  function localFiles(list: LocalFile[]) { return list.map((f, i) => f.url ? <a key={`${f.name}-${i}`} className="cp-file" href={f.url} target="_blank" rel="noreferrer" download={f.name}>{f.mime.startsWith("image/") ? <img src={f.url} alt={f.name}/> : <Icon name="file"/>}<span>{f.name}<small>{Math.ceil(f.size / 1024)} KB · local file</small></span></a> : <div className="cp-file" key={`${f.name}-${i}`}><Icon name="file"/><span>{f.name}<small>Local preview expired. Attach the file again to view it.</small></span></div>); }

  return <section className={`cp-page ${panel ? "has-panel" : ""}`} aria-label="Chat design preview">
    <div className="cp-page-heading"><div><h1><span className="cp-brand-mark"><GroupBadge name="leaf"/></span>Chat<span className="cp-heading-divider"/>Herbal Deck</h1></div><div className="cp-heading-controls"><span className="cp-preview-tag">Local preview</span><div className="cp-theme"><ThemeToggle/></div></div></div>
    <div className="cp-preview-note"><Icon name="info"/><span>Your design playground. Messages and changes stay in this tab.</span></div>
    {storageError && <p role="alert">Browser storage is full or unavailable. Changes will last until this page is closed.</p>}
    <div className={`cp-workspace ${mobileThread ? "cp-thread-open" : ""}`}>
      <aside className="cp-list" aria-label="Conversations">
        <div className="cp-list-heading"><h2>Conversations <span>{all.length}</span></h2><Tool label="New conversation" icon="plus" onClick={() => { setPanel("new"); setPicked([]); setMobileThread(true); }}/></div>
        <label className="cp-search"><Icon name="search"/><input aria-label="Search conversations" placeholder="Find a conversation" value={query} onChange={e => setQuery(e.target.value)}/>{query && <button aria-label="Clear conversation search" onClick={() => setQuery("")}><Icon name="close"/></button>}</label>
        <div className="cp-filters" aria-label="Filter conversations">{["All", "Unread", "Groups"].map(f => <button key={f} aria-pressed={filter === f} className={filter === f ? "selected" : ""} onClick={() => setFilter(f)}>{f}{f === "Unread" && all.some(c => c.unread > 0) && <span>{all.filter(c => c.unread > 0).length}</span>}</button>)}</div>
        <div className="cp-conversations">{visible.length === 0 && <div className="cp-small-empty"><Icon name="search"/><strong>{filter === "Unread" ? "You’re all caught up" : "No conversations found"}</strong><p>{query ? "Try another name or clear your search." : "Your conversations will appear here."}</p><button onClick={() => { setQuery(""); setFilter("All"); }}>Show all conversations</button></div>}{visible.map(c => {
          const recent = store.messages[c.id]?.filter(m => m.local).at(-1);
          const preview = store.drafts[c.id] || (recent?.deleted ? "Message deleted" : recent?.body) || c.lastMessagePreview || "Start a conversation";
          return <button key={c.id} className={`cp-conversation ${selected === c.id ? "selected" : ""}`} aria-current={selected === c.id ? "true" : undefined} onClick={() => open(c.id)}>{avatar(c.type === "group" ? c.id : c.participantIds.find(id => id !== me.id) || me.id, c.type === "group")}<span className="cp-conversation-text"><span className="cp-conversation-top"><strong>{title(c)}</strong><small>{c.id === DEMO ? "Sample" : recent ? clock(recent.created_at) : c.lastMessageAt ? new Date(c.lastMessageAt).toLocaleDateString([], { month: "short", day: "numeric" }) : ""}</small></span><span className="cp-conversation-bottom"><span>{store.drafts[c.id] && <em>Draft: </em>}{preview}</span>{c.unread > 0 && <b>{c.unread}</b>}</span></span></button>;
        })}</div>
        <div className="cp-list-footer"><span className="cp-sandbox-dot"/>A little space for better teamwork.</div>
      </aside>
      <section className="cp-thread" aria-label={title(current)} onDragOver={e => { e.preventDefault(); if (!editing) setDragging(true); }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }} onDrop={e => { e.preventDefault(); setDragging(false); if (!editing) attach(e.dataTransfer.files); }}>
        <header className="cp-thread-header"><span className="cp-mobile-back"><Tool label="Back to conversations" icon="back" onClick={() => { setMobileThread(false); setPanel(null); }}/></span>{avatar(current.type === "group" ? current.id : current.participantIds.find(id => id !== me.id) || me.id, current.type === "group", "header")}<div className="cp-thread-title"><h2>{title(current)}</h2><p>{selected === DEMO ? "Sample conversation · explore the design" : current.type === "group" ? `${current.participantIds.length} members` : person(current.participantIds.find(id => id !== me.id) || "")?.post || "Direct conversation"}</p></div><div className="cp-header-actions"><Tool label="Search this conversation" icon="search" active={panel === "search"} onClick={() => setPanel(panel === "search" ? null : "search")}/><Tool label="Pinned messages" icon="pin" active={panel === "pins"} onClick={() => setPanel(panel === "pins" ? null : "pins")}/><Tool label="Conversation details" icon="info" active={panel === "info"} onClick={() => { setRename(current.name || ""); setPanel(panel === "info" ? null : "info"); }}/></div></header>
        {offline && <div className="cp-offline" role="status">You’re offline. Local messages and drafts still work; shared history needs a connection.</div>}
        {pinned.length > 0 && <button className="cp-pinned-strip" onClick={() => setPanel("pins")}><Icon name="pin"/><strong>Pinned</strong><span>{pinned[0].body.split("\n")[0]}</span><small>{pinned.length}</small></button>}
        <div className="cp-message-area" ref={thread} onScroll={() => { cancelLongPress(); const el = thread.current; if (el) { const distance = el.scrollHeight - el.scrollTop - el.clientHeight; scrollBottom.current = isNearBottom(el.scrollTop, el.clientHeight, el.scrollHeight); setAway(distance > 180); } }}>
          <div className="cp-history-note">{selected.startsWith("local-") ? "Local conversation — only visible to you" : "Shared history · latest 300 messages · local changes below"}</div>
          {loading && <div className="cp-small-empty" role="status">Loading your conversation…</div>}
          {loadError && <div className="cp-small-empty" role="alert"><strong>{loadError}</strong><button onClick={() => setRetry(r => r + 1)}>Try again</button></div>}
          {!loading && !loadError && merged.length === 0 && <div className="cp-empty-thread"><span className="cp-empty-art"><GroupBadge name="leaf"/><span><Icon name="chat"/></span></span><h3>A new conversation starts here.</h3><p>Say hello, share an idea, or bring your team together.</p></div>}
          {!loading && merged.map((m, i) => {
            const mine = m.sender_id === me.id;
            const prev = merged[i - 1]; const next = merged[i + 1];
            const newDay = !prev || day(prev.created_at) !== day(m.created_at);
            const first = !canGroup(prev, m);
            const last = !next || !canGroup(m, next);
            const quoted = merged.find(x => x.id === m.reply);
            const canEdit = mine && now > 0 && now - Date.parse(m.created_at) <= 900_000;
            return <Fragment key={m.id}>{newDay && <div className="cp-date"><span>{day(m.created_at)}</span></div>}<article tabIndex={-1} onPointerDown={event => {
                if (event.pointerType === "mouse" || m.deleted || (event.target as HTMLElement).closest("button,a")) return;
                cancelLongPress(); const element = event.currentTarget;
                longPress.current = { x:event.clientX, y:event.clientY, timer:setTimeout(() => { element.focus({preventScroll:true}); setMenu(m.id); longPress.current = null; },450) };
              }} onPointerMove={event => { const press = longPress.current; if (press && Math.hypot(event.clientX - press.x,event.clientY - press.y) > 10) cancelLongPress(); }} onPointerUp={cancelLongPress} onPointerCancel={cancelLongPress} id={`message-${m.id}`} className={`cp-message ${mine ? "mine" : "incoming"} ${first ? "first" : ""} ${last ? "last" : ""} ${highlight === m.id ? "highlight" : ""}`}>
              <div className="cp-message-avatar">{!mine && first && avatar(m.sender_id, false, "message")}</div>
              <div className="cp-message-content">{first && !mine && <div className="cp-sender">{name(m.sender_id)}</div>}
                <div className="cp-bubble" style={!mine ? { "--sender": person(m.sender_id)?.color || "var(--primary)" } as CSSProperties : undefined}>
                  {quoted && !m.deleted && <button className="cp-quote" onClick={() => jump(quoted.id)}><strong>{name(quoted.sender_id)}</strong><span>{quoted.deleted ? "Message deleted" : quoted.body || "Attachment"}</span></button>}
                  {m.deleted ? <p className="cp-deleted">This message was deleted</p> : <><p className="cp-body">{m.body.split(/(https?:\/\/[^\s]+)/g).map((part, j) => /^https?:\/\//.test(part) ? <a key={j} href={part} target="_blank" rel="noreferrer">{part.length > 90 ? `${part.slice(0, 87)}…` : part}</a> : part)}</p>{m.attachments?.length > 0 && <MessageAttachments supabase={supabase} attachments={m.attachments}/>} {m.files && localFiles(m.files)}{detectShareLinks(m.body).length > 0 && <LinkPreviewCards links={detectShareLinks(m.body)}/>}</>}
                </div>
                {!!m.reactions?.length && !m.deleted && <div className="cp-reactions">{m.reactions.map(emoji => <button key={emoji} title={`Remove your ${emoji} reaction`} aria-pressed="true" onClick={() => patchMessage(m, { reactions: m.reactions?.filter(r => r !== emoji) })}>{emoji}<span>1</span></button>)}</div>}
                {last && <div className="cp-message-meta">{m.pinned && <Icon name="pin"/>}{m.edited && "Edited · "}{clock(m.created_at)}{mine && m.local && <><Icon name="check"/><span>Local</span></>}</div>}
              </div>
              {!m.deleted && <div className={`cp-message-actions ${menu === m.id ? "open" : ""}`}><Tool label={`Reply to message from ${name(m.sender_id)}`} icon="reply" onClick={() => { setReply(m); setEditing(null); input.current?.focus(); }}/><Tool label="Message actions" icon="more" active={menu === m.id} onClick={() => setMenu(menu === m.id ? null : m.id)}/>{menu === m.id && <MessageActionPopover onClose={() => setMenu(null)}><div className="cp-emoji">{EMOJI.map(emoji => <button key={emoji} aria-label={`React ${emoji}`} onClick={() => { patchMessage(m, { reactions: m.reactions?.includes(emoji) ? m.reactions.filter(r => r !== emoji) : [...(m.reactions || []), emoji] }); setMenu(null); }}>{emoji}</button>)}</div><button onClick={() => { patchMessage(m, { pinned: !m.pinned }); setMenu(null); }}>{m.pinned ? "Unpin message" : "Pin message"}</button><button onClick={async () => { try { await navigator.clipboard.writeText(m.body); setNotice("Message copied."); } catch { setNotice("Clipboard unavailable. Select the message text to copy it."); } setMenu(null); }}>Copy text</button>{canEdit && <><button onClick={() => { setEditing(m); setEditText(m.body); setReply(null); setMenu(null); input.current?.focus(); }}>Edit message</button><button className="cp-danger" onClick={() => { if (Date.now() - Date.parse(m.created_at) <= 900_000) patchMessage(m, { deleted: true, pinned: false }); else setNotice("The 15-minute delete window has ended."); setMenu(null); }}>Delete locally</button></>}</MessageActionPopover>}</div>}
            </article></Fragment>;
          })}
        </div>
        {away && <button className="cp-jump" onClick={() => { scrollBottom.current = true; thread.current?.scrollTo({ top: thread.current.scrollHeight, behavior: "smooth" }); setAway(false); }}>Back to latest <Icon name="down"/></button>}
        <div className="cp-composer-wrap">
          {(reply || editing) && <div className="cp-compose-context"><Icon name="reply"/><span><strong>{editing ? "Editing your message" : `Replying to ${name(reply!.sender_id)}`}</strong><small>{(editing || reply)?.body || "Attachment"}</small></span><Tool label="Cancel reply or edit" icon="close" onClick={() => { setReply(null); setEditing(null); }}/></div>}
          {files.length > 0 && <div className="cp-pending-files">{files.map((f, i) => <div key={`${f.name}-${i}`}><Icon name="file"/><span>{f.name}</span><button aria-label={`Remove ${f.name}`} onClick={() => setFiles(fs => fs.filter((_, n) => n !== i))}><Icon name="close"/></button></div>)}</div>}
          {suggestions.length > 0 && <div className="cp-mentions" aria-label="Mention suggestions">{suggestions.map((id, index) => <button className={index === mentionIndex ? "is-active" : ""} key={id} onClick={() => { setText(text.replace(/@[^@\n]*$/, `@${name(id)} `)); setMentionOpen(false); input.current?.focus(); }}>{avatar(id)}{name(id)}</button>)}</div>}
          <div className="cp-composer"><input ref={upload} type="file" accept={ATTACHMENT_ACCEPT} multiple hidden onChange={e => { if (e.target.files) attach(e.target.files); e.target.value = ""; }}/><button type="button" className="cp-tool" disabled={Boolean(editing)} title="Attach files" aria-label="Attach files" onClick={() => upload.current?.click()}><Icon name="plus"/></button><textarea ref={input} rows={1} aria-label="Write a message" placeholder={`Message ${title(current)}…`} value={text} onChange={e => setText(e.target.value)} onPaste={e => { if (!editing && e.clipboardData.files.length) { e.preventDefault(); attach(e.clipboardData.files); } }} onKeyDown={e => {
              if (suggestions.length && !e.nativeEvent.isComposing) {
                if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setMentionIndex(i => (i + (e.key === "ArrowDown" ? 1 : -1) + suggestions.length) % suggestions.length); return; }
                if (e.key === "Enter") { e.preventDefault(); const id = suggestions[mentionIndex % suggestions.length]; setText(text.replace(/@[^@\n]*$/, `@${name(id)} `)); setMentionOpen(false); return; }
              }
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } if (e.key === "Escape") setMentionOpen(false); }}/><button className="cp-send" aria-label={editing ? "Save edit" : "Send local message"} disabled={(!text.trim() && !files.length) || loading || !ready} onClick={send}><Icon name={editing ? "check" : "send"}/></button></div>
          <div className="cp-composer-hint"><span><strong>@</strong> mention · Shift + Enter for a new line</span><span>Only in this preview</span></div>
        </div>
        {dragging && <div className="cp-drop-zone"><Icon name="attach"/><h3>Drop files into the conversation</h3><p>Up to 6 files · 3 MB each · kept locally</p></div>}
        {panel && <aside ref={panelRef} className="cp-panel" aria-label={panel === "new" ? "New conversation" : panel === "search" ? "Conversation search" : panel === "pins" ? "Pinned messages" : "Conversation details"}>
          <div className="cp-panel-heading"><h3>{panel === "new" ? "New conversation" : panel === "search" ? "Find a message" : panel === "pins" ? "Pinned messages" : "Conversation details"}</h3><Tool label="Close panel" icon="close" onClick={() => setPanel(null)}/></div>
          <div className="cp-panel-body">
          {panel === "search" && <><label className="cp-search"><Icon name="search"/><input autoFocus aria-label="Search messages" placeholder="Search this conversation" value={threadQuery} onChange={e => { setThreadQuery(e.target.value); setMatchIndex(0); }}/></label><p className="cp-panel-caption">{threadQuery ? `${hits.length} results in loaded messages` : "Find a phrase, then jump to its context."}</p>{hits.length > 0 && <div className="cp-search-navigation"><span>{matchIndex + 1} of {hits.length}</span><button aria-label="Previous search result" onClick={() => { const i = (matchIndex - 1 + hits.length) % hits.length; setMatchIndex(i); jump(hits[i].id, false); }}>Previous</button><button aria-label="Next search result" onClick={() => { const i = (matchIndex + 1) % hits.length; setMatchIndex(i); jump(hits[i].id, false); }}>Next</button></div>}{hits.map(m => <button className="cp-result" key={m.id} onClick={() => jump(m.id)}><strong>{name(m.sender_id)}</strong><p>{m.body}</p><small>{day(m.created_at)} · {clock(m.created_at)}</small></button>)}</>}
          {panel === "pins" && <><p className="cp-panel-caption">Keep decisions close to the conversation.</p>{pinned.length === 0 && <div className="cp-small-empty"><Icon name="pin"/><strong>No pinned messages yet</strong><p>Open a message’s actions and choose Pin message.</p></div>}{pinned.map(m => <div className="cp-pin-card" key={m.id}><button className="cp-result" onClick={() => jump(m.id)}><strong>{name(m.sender_id)}</strong><p>{m.body}</p><small>Jump to message</small></button><button className="cp-text-button" onClick={() => patchMessage(m, { pinned: false })}>Unpin</button></div>)}</>}
          {panel === "info" && <><div className="cp-profile-summary">{avatar(current.type === "group" ? current.id : current.participantIds.find(id => id !== me.id) || me.id, current.type === "group", "detail")}<h3>{title(current)}</h3><p>{current.type === "group" ? `${current.participantIds.length} people in this space` : "A direct conversation"}</p></div>{current.type === "group" && <fieldset className="cp-badge-picker"><legend>Group identity <span>Local</span></legend><div>{GROUP_BADGES.map(b => <label key={b} title={BADGE_LABELS[b]}><input type="radio" name="group-badge" aria-label={BADGE_LABELS[b]} checked={(store.badges?.[current.id] || (current.id === DEMO ? "layers" : undefined)) === b} onChange={() => setStore(s => ({ ...s, badges: { ...s.badges, [current.id]: b } }))}/><GroupBadge name={b}/></label>)}</div></fieldset>}<h4>People</h4>{current.participantIds.map(id => <div className="cp-person" key={id}>{avatar(id)}<span><strong>{name(id)}</strong><small>{id === me.id ? "You" : id.startsWith("sample-") ? "Sample participant" : "Team member"}</small></span></div>)}{current.type === "group" && current.amAdmin && <form className="cp-rename" onSubmit={e => { e.preventDefault(); if (rename.trim()) { setStore(s => ({ ...s, conversations: [...s.conversations.filter(c => c.id !== current.id), { ...current, name: rename.trim() }] })); setNotice("Group name updated in this preview."); } }}><label htmlFor="cp-group-name">Group name</label><input id="cp-group-name" value={rename} onChange={e => setRename(e.target.value)} maxLength={80}/><button className="cp-primary" disabled={!rename.trim()}>Save local name</button></form>}<h4>Shared files</h4>{!merged.some(m => !m.deleted && (m.attachments?.length || m.files?.length)) && <p className="cp-panel-caption">Files shared here will appear together.</p>}{merged.filter(m => !m.deleted).map(m => <div className="cp-shared-files" key={m.id}>{!!m.attachments?.length && <MessageAttachments supabase={supabase} attachments={m.attachments}/>} {m.files && localFiles(m.files)}</div>)}</>}
          {panel === "new" && <><p className="cp-panel-caption">Choose one person for a direct chat, or several for a group. Created only in this preview.</p><label className="cp-search"><Icon name="search"/><input autoFocus aria-label="Find people" placeholder="Search your team" value={newQuery} onChange={e => setNewQuery(e.target.value)}/></label>{picked.length > 1 && <input className="cp-group-input" aria-label="New group name" placeholder="Give your group a name" value={groupName} onChange={e => setGroupName(e.target.value)} maxLength={80}/>}{people.filter(p => p.active && p.id !== me.id && !p.id.startsWith("sample-") && p.name.toLowerCase().includes(newQuery.toLowerCase())).map(p => <label className="cp-person cp-select-person" key={p.id}>{avatar(p.id)}<span>{p.name}</span><input type="checkbox" checked={picked.includes(p.id)} onChange={() => setPicked(ids => ids.includes(p.id) ? ids.filter(id => id !== p.id) : [...ids, p.id])}/></label>)}<button className="cp-primary" disabled={!picked.length || (picked.length > 1 && !groupName.trim())} onClick={startConversation}>{picked.length > 1 ? `Create group (${picked.length})` : "Start conversation"}</button></>}
          </div>
        </aside>}
      </section>
    </div>
    {notice && <div className="cp-toast" role="status">{notice}</div>}
  </section>;
}
