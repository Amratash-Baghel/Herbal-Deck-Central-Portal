"use client";
/* eslint-disable @next/next/no-img-element -- Local attachment preview URLs. */

import { Fragment, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { useLiveChat, type LiveMessage } from "./use-live-chat";
import { sendMessage, editChatMessage, deleteChatMessage, setMessageReaction, setMessagePin, startDirectMessage, createGroup, renameGroup, addGroupMembers, removeGroupMember, leaveGroup } from "@/app/(dashboard)/chat/actions";
import { MessageAttachments } from "./message-attachments";
import { LinkPreviewCards } from "./link-preview";
import { ThemeToggle } from "@/components/theme-toggle";
import { MessageActionPopover } from "./message-actions";
import { GifPicker } from "./gif-picker";
import { shrinkImage } from "@/lib/shrink-image";
import { ChatAvatar } from "./chat-avatar";
import { GroupBadge } from "./group-badges";
import { canGroup, isNearBottom, formatConversationDate, messageTextParts, insertAt, isGifUrl, previewText, PICKER_EMOJI } from "./chat-model";
import { detectShareLinks, checkFile, uploadChatAttachment, ATTACHMENT_ACCEPT, MAX_ATTACHMENTS_PER_MESSAGE, type Attachment } from "@/lib/chat-attachments";

import type { ConversationSummary, DirectoryEntry } from "./types";
import "./chat-base.css";
import "./chat.css";

type Person = DirectoryEntry & { color?: string | null; avatarPath?: string | null; post?: string | null };
type LocalFile = { name: string; mime: string; size: number; url: string; file: File; uploaded?: Attachment; progress?: number };
type PreviewMessage = LiveMessage;
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
  smile: <><circle cx="12" cy="12" r="9"/><path d="M9 10h.01M15 10h.01M8.5 14.5a4.5 4.5 0 0 0 7 0"/></>,
  gif: <><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10.2 10H8.6a1.1 1.1 0 0 0-1.1 1.1v1.8A1.1 1.1 0 0 0 8.6 14h1.6v-1.8M12.6 10v4M15.2 14v-4h2.3M15.2 12.2h1.9"/></>,
};
function Icon({ name }: { name: string }) { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.chat}</svg>; }
function Tool({ label, icon, onClick, active }: { label: string; icon: string; onClick: () => void; active?: boolean }) { return <button type="button" className={`cp-tool ${active ? "is-active" : ""}`} title={label} aria-label={label} aria-pressed={active} onClick={onClick}><Icon name={icon}/></button>; }

export function LiveChat({ me, directory: initialDirectory, conversations: initialConversations, initialConversationId }: { me: { id: string; name: string }; directory: Person[]; conversations: ConversationSummary[]; initialConversationId?: string }) {
  const live = useLiveChat(me.id,initialConversations,initialDirectory,initialConversationId);
  const {supabase,directory,conversations,selected,base,loading,loadError,advanced} = live;
  const [store,setStore] = useState<{drafts:Record<string,string>}>({drafts:{}});
  const [ready,setReady] = useState(false);
  const [mobileThread, setMobileThread] = useState(Boolean(initialConversationId));
  const [sending,setSending] = useState(false);
  const sendingRef = useRef(false);
  const requestId = useRef<string | null>(null);
  const [actionBusy,setActionBusy] = useState(false);
  const [searchResults,setSearchResults] = useState<LiveMessage[]>([]);
  const [searching,setSearching] = useState(false);
  const [searchError,setSearchError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
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
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [gifOpen, setGifOpen] = useState(false);
  const caret = useRef<[number, number]>([0, 0]);
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
  const storeKey = `herbal-chat-drafts-v1:${me.id}`;
  const people:Person[] = directory;
  const person = (id:string) => people.find(p=>p.id===id);
  const name = (id:string) => id===me.id ? me.name : person(id)?.name || "Former employee";
  const all=[...conversations].sort((a,b)=>(b.lastMessageAt || "").localeCompare(a.lastMessageAt || "") || a.id.localeCompare(b.id));
  const current = all.find(c=>c.id===selected) || {id:"",type:"dm" as const,name:null,participantIds:[],amAdmin:false,unread:0,lastMessageAt:null,lastMessagePreview:null};
  const title = (c:ConversationSummary) => !c.id ? "Your conversations" : c.type==="group" ? c.name || "Group" : name(c.participantIds.find(id=>id!==me.id) || me.id);
  const merged = base;
  const draft = store.drafts[selected] || "";
  const text = editing ? editText : draft;
  const pinned = live.pinnedMessages;
  const hits = searchResults;
  const visible = all.filter(c => (filter !== "Unread" || c.unread > 0) && (filter !== "Groups" || c.type === "group") && title(c).toLowerCase().includes(query.toLowerCase()));
  const mentionTerm = text.match(/(?:^|\s)@([^@\n]*)$/)?.[1];
  const suggestions = mentionOpen && mentionTerm !== undefined ? current.participantIds.filter(id => id !== me.id && name(id).toLowerCase().includes(mentionTerm.toLowerCase())).slice(0, 5) : [];

  useEffect(() => {
    let drafts:Record<string,string>={};
    try { const raw=JSON.parse(sessionStorage.getItem(storeKey) || "{}"); if(raw && typeof raw==="object") drafts=Object.fromEntries(Object.entries(raw).filter((entry):entry is [string,string]=>typeof entry[1]==="string")); } catch {}
    queueMicrotask(()=>{setStore({drafts});setReady(true);});
  },[storeKey]);
  useEffect(()=>{
    if(!ready) return;
    try {sessionStorage.setItem(storeKey,JSON.stringify(store.drafts));} catch {queueMicrotask(()=>setStorageError(true));}
  },[store,ready,storeKey]);
  useEffect(()=>{
    if(scrollBottom.current && thread.current) thread.current.scrollTop=thread.current.scrollHeight;
  },[base,selected]);
  useEffect(()=>{
    let cancelled=false;
    const query=threadQuery.trim().slice(0,200);
    if(!query || !selected) {queueMicrotask(()=>{setSearchResults([]);setSearching(false);}); return;}
    const timer=setTimeout(async()=>{
      setSearching(true);setSearchError("");
      const escaped=query.replace(/[\\%_]/g, c=>"\\"+c);
      const result=await supabase.from("messages").select("*").eq("conversation_id",selected).ilike("body",`%${escaped}%`).order("created_at",{ascending:false}).limit(50);
      if(cancelled) return;
      setSearching(false);
      if(result.error) {setSearchResults([]);setSearchError("Search failed. Try again.");}
      else setSearchResults((result.data || []).filter(m=>!m.deleted_at));
    },250);
    return ()=>{cancelled=true;clearTimeout(timer);};
  },[threadQuery,selected,supabase]);
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
    return <ChatAvatar id={id} name={name(id)} kind={group ? "group" : "person"} avatarPath={p?.avatarPath} color={p?.color} size={size} />;
  }
  // The picker is a modal dialog, so the textarea is blurred while it is open: the
  // caret is tracked in a ref and restored once the picker closes.
  function openEmoji() {
    const el = input.current;
    caret.current = [el?.selectionStart ?? text.length, el?.selectionEnd ?? text.length];
    setEmojiOpen(true);
  }
  function insertEmoji(emoji: string) {
    const [start, end] = caret.current;
    caret.current = [start + emoji.length, start + emoji.length];
    setText(insertAt(text, start, end, emoji));
    setMentionOpen(false);
  }
  function closeEmoji() {
    setEmojiOpen(false);
    requestAnimationFrame(() => { const el = input.current; if (!el) return; el.focus(); el.setSelectionRange(caret.current[0], caret.current[1]); });
  }
  function setText(value: string) { requestId.current=null; if (editing) setEditText(value); else setStore(s => ({ ...s, drafts: { ...s.drafts, [selected]: value } })); setMentionOpen(true); setMentionIndex(0); }
  function open(id:string) {
    if(sendingRef.current) {setNotice("Wait for this send to finish before switching conversations.");return;}
    scrollBottom.current=true;
    live.select(id);setMobileThread(true);setReply(null);setEditing(null);setMenu(null);setPanel(null);setThreadQuery("");setFiles([]);setAway(false);requestId.current=null;
  }
  async function mutate(action:()=>Promise<{ok:boolean;error?:string;message?:LiveMessage}>) {
    if(actionBusy) return;
    setActionBusy(true);
    try {
      const result=await action();
      if(!result.ok) setNotice(result.error || "Could not save this change.");
      else {if(result.message) await live.accept(result.message); await live.sync(); await live.refreshConversations();}
      return result.ok;
    } catch {setNotice("Could not save this change. Check your connection and try again.");return false;}
    finally {setActionBusy(false);}
  }
  async function send() {
    if(sendingRef.current || !selected || (!text.trim() && !files.length) || loading || !ready || offline) return;
    if(text.trim().length>4000) {setNotice("Messages can contain up to 4,000 characters.");return;}
    sendingRef.current=true;setSending(true);
    try {
      if(editing) {
        const result=await editChatMessage(editing.id,text);
        if(!result.ok || !result.message) {setNotice(result.error || "Could not edit message.");return;}
        await live.accept(result.message);setEditing(null);setEditText("");
      } else {
        const attachments:Attachment[]=[];
        if(files.length) {
          const {data}=await supabase.auth.getSession();
          if(!data.session) {setNotice("Please sign in again. Your draft is saved.");return;}
          for(const f of files) {
            if(f.uploaded) {attachments.push(f.uploaded);continue;}
            const check=checkFile(f.file);
            if(!check.ok) {setNotice(check.error);return;}
            const uploaded=await uploadChatAttachment({conversationId:selected,file:f.file,accessToken:data.session.access_token,...check,
              onProgress:pct=>setFiles(fs=>fs.map(x=>x.url===f.url ? {...x,progress:pct}:x))});
            attachments.push(uploaded);
            setFiles(fs=>fs.map(x=>x.url===f.url ? {...x,uploaded,progress:100}:x));
          }
        }
        requestId.current ||= crypto.randomUUID();
        const result=await sendMessage(selected,text,current.participantIds.filter(id=>id!==me.id && text.includes(`@${name(id)}`)),attachments,
          advanced ? {clientRequestId:requestId.current,replyToId:reply?.id}:undefined);
        if(!result.ok || !result.message) {setNotice(result.error || "Send failed. Your draft and files are kept for retry.");return;}
        await live.accept(result.message);
        setStore(s=>({...s,drafts:{...s.drafts,[selected]:""}}));setReply(null);setFiles([]);requestId.current=null;
      }
      if(live.windowed) await live.latest();
      scrollBottom.current=true;live.setAtBottom(true);setAway(false);input.current?.focus();
    // An upload that fails already says why ("larger than 3MB", "check your
    // connection"); hiding that behind the generic line makes a fixable problem
    // look like a mystery.
    } catch(e) {setNotice(e instanceof Error && e.message ? e.message : "Send could not be confirmed. Your draft and files are kept. Check the conversation before retrying.");}
    finally {sendingRef.current=false;setSending(false);}
  }
  /**
   * Send a Giphy GIF as its link. The thread already renders a `.gif` link as
   * an inline image, so it looks the same as an uploaded one — but Giphy's CDN
   * serves it, so it costs no storage and no Supabase egress per view.
   */
  async function sendGifLink(url: string) {
    if(sendingRef.current || !selected || loading || !ready || offline || editing) return;
    sendingRef.current=true;setSending(true);
    try {
      const result=await sendMessage(selected,url,[],[],advanced ? {clientRequestId:crypto.randomUUID(),replyToId:reply?.id}:undefined);
      if(!result.ok || !result.message) {setNotice(result.error || "Could not send the GIF.");return;}
      await live.accept(result.message);
      setReply(null);
      if(live.windowed) await live.latest();
      scrollBottom.current=true;live.setAtBottom(true);setAway(false);
    } catch {setNotice("Could not send the GIF. Check your connection and try again.");}
    finally {sendingRef.current=false;setSending(false);}
  }
  async function attach(list: FileList | File[]) {
    if(sendingRef.current || !selected) return;
    requestId.current=null;
    // Shrink photos before the size check: a 6 MB phone photo becomes a few
    // hundred KB, so it fits under the 3 MB cap instead of being refused, and
    // costs a fraction of the storage and bandwidth.
    const incoming = await Promise.all(Array.from(list).map(file => shrinkImage(file)));
    if (files.length + incoming.length > MAX_ATTACHMENTS_PER_MESSAGE) { setNotice("You can attach up to six files per message."); return; }
    const invalid = incoming.map(file => ({ file, result: checkFile(file) })).find(({ result }) => !result.ok);
    if (invalid && !invalid.result.ok) { setNotice(invalid.result.error); return; }
    const accepted = incoming.map(file => {
      const check = checkFile(file);
      const url = URL.createObjectURL(file); objectUrls.current.push(url);
      return { name: file.name, mime: check.ok ? check.mime : file.type, size: file.size, url, file };
    });
    setFiles(prev => [...prev, ...accepted]);
  }
  async function jump(id:string,close=true) {
    if(close) setPanel(null);scrollBottom.current=false;live.setAtBottom(false);setHighlight(id);
    if(!base.some(m=>m.id===id)) {
      if(!await live.showMessage(id)) {setNotice("This message is no longer available.");return;}
    }
    requestAnimationFrame(()=>document.getElementById(`message-${id}`)?.scrollIntoView({block:"center",behavior:"smooth"}));
  }
  async function startConversation() {
    if(actionBusy || !picked.length || (picked.length>1 && !groupName.trim())) return;
    setActionBusy(true);
    try {
      const result=picked.length===1 ? await startDirectMessage(picked[0]) : await createGroup(groupName.trim(),picked);
      if(!result.ok || !result.conversationId) {setNotice(result.error || "Could not start conversation.");return;}
      await live.refreshConversations();open(result.conversationId);setPicked([]);setGroupName("");
    } catch {setNotice("Could not start this chat. Ask your administrator to check the server configuration.");}
    finally {setActionBusy(false);}
  }
  async function older() {
    const el=thread.current, height=el?.scrollHeight || 0, top=el?.scrollTop || 0;
    scrollBottom.current=false;live.setAtBottom(false);
    await live.loadOlder();
    requestAnimationFrame(()=>{if(el) el.scrollTop=top+(el.scrollHeight-height);});
  }
  const unreadIndex=live.unreadAfter ? merged.findIndex(m=>m.sender_id!==me.id && !m.deleted && m.created_at>live.unreadAfter!) : -1;
  return <section className={`cp-page ${panel ? "has-panel" : ""}`} aria-label="Team chat">
    <div className="cp-page-heading"><div><h1><span className="cp-brand-mark"><GroupBadge name="leaf"/></span>Chat<span className="cp-heading-divider"/>Herbal Deck</h1></div><div className="cp-heading-controls"><Link href="/profile" className="cp-profile-link" title="Change your profile picture">{avatar(me.id,false,"message")}<span>My picture</span></Link><div className="cp-theme"><ThemeToggle/></div></div></div>
    {storageError && <p role="alert">Browser storage is full or unavailable. Changes will last until this page is closed.</p>}
    <div className={`cp-workspace ${mobileThread ? "cp-thread-open" : ""}`}>
      <aside className="cp-list" aria-label="Conversations">
        <div className="cp-list-heading"><h2>Conversations <span>{all.length}</span></h2><Tool label="New conversation" icon="plus" onClick={() => { if(sending) return; setPanel("new"); setPicked([]); setMobileThread(true); }}/></div>
        <label className="cp-search"><Icon name="search"/><input aria-label="Search conversations" placeholder="Find a conversation" value={query} onChange={e => setQuery(e.target.value)}/>{query && <button aria-label="Clear conversation search" onClick={() => setQuery("")}><Icon name="close"/></button>}</label>
        <div className="cp-filters" aria-label="Filter conversations">{["All", "Unread", "Groups"].map(f => <button key={f} aria-pressed={filter === f} className={filter === f ? "selected" : ""} onClick={() => setFilter(f)}>{f}{f === "Unread" && all.some(c => c.unread > 0) && <span>{all.filter(c => c.unread > 0).length}</span>}</button>)}</div>
        <div className="cp-conversations">{visible.length === 0 && <div className="cp-small-empty"><Icon name="search"/><strong>{filter === "Unread" ? "You’re all caught up" : "No conversations found"}</strong><p>{query ? "Try another name or clear your search." : "Your conversations will appear here."}</p><button onClick={() => { setQuery(""); setFilter("All"); }}>Show all conversations</button></div>}{visible.map(c => {
          const preview = store.drafts[c.id] || (c.lastMessagePreview ? previewText(c.lastMessagePreview) : "") || "Start a conversation";
          return <button key={c.id} className={`cp-conversation ${selected === c.id ? "selected" : ""}`} aria-current={selected === c.id ? "true" : undefined} onClick={() => open(c.id)}>{avatar(c.type === "group" ? c.id : c.participantIds.find(id => id !== me.id) || me.id, c.type === "group")}<span className="cp-conversation-text"><span className="cp-conversation-top"><strong>{title(c)}</strong><small>{c.lastMessageAt ? formatConversationDate(c.lastMessageAt) : ""}</small></span><span className="cp-conversation-bottom"><span>{store.drafts[c.id] && <em>Draft: </em>}{preview}</span>{c.unread > 0 && <b>{c.unread}</b>}</span></span></button>;
        })}</div>
        <div className="cp-list-footer"><span>{offline ? "Offline" : live.connection}</span></div>
      </aside>
      <section className="cp-thread" aria-label={title(current)} onDragOver={e => { e.preventDefault(); if (!editing) setDragging(true); }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }} onDrop={e => { e.preventDefault(); setDragging(false); if (!editing) attach(e.dataTransfer.files); }}>
        {selected && <header className="cp-thread-header"><span className="cp-mobile-back"><Tool label="Back to conversations" icon="back" onClick={() => { if(sending) return; setMobileThread(false); setPanel(null); live.select(""); }}/></span>{avatar(current.type === "group" ? current.id : current.participantIds.find(id => id !== me.id) || me.id, current.type === "group", "header")}<div className="cp-thread-title"><h2>{title(current)}</h2><p>{current.type === "group" ? `${current.participantIds.length} members` : person(current.participantIds.find(id => id !== me.id) || "")?.post || "Direct conversation"}</p></div><div className="cp-header-actions"><Tool label="Search this conversation" icon="search" active={panel === "search"} onClick={() => setPanel(panel === "search" ? null : "search")}/>{advanced && <Tool label="Pinned messages" icon="pin" active={panel === "pins"} onClick={() => setPanel(panel === "pins" ? null : "pins")}/>}<Tool label="Conversation details" icon="info" active={panel === "info"} onClick={() => { setRename(current.name || ""); setPanel(panel === "info" ? null : "info"); }}/></div></header>}
        {offline && <div className="cp-offline" role="status">You’re offline. Your draft is kept; reconnect before sending.</div>}
        {pinned.length > 0 && <button className="cp-pinned-strip" onClick={() => setPanel("pins")}><Icon name="pin"/><strong>Pinned</strong><span>{pinned[0].body.split("\n")[0]}</span><small>{pinned.length}</small></button>}
        <div className="cp-message-area" ref={thread} onScroll={() => { cancelLongPress(); const el = thread.current; if (el) { const distance = el.scrollHeight - el.scrollTop - el.clientHeight; scrollBottom.current = isNearBottom(el.scrollTop, el.clientHeight, el.scrollHeight); setAway(distance > 180); live.setAtBottom(scrollBottom.current); void live.markRead(); } }}>
          {selected && live.hasOlder && <button className="cp-load-older" disabled={live.olderBusy} onClick={older}>{live.olderBusy ? "Loading…" : "Load older messages"}</button>}
          {loading && <div className="cp-small-empty" role="status">Loading your conversation…</div>}
          {loadError && <div className="cp-small-empty" role="alert"><strong>{loadError}</strong><button onClick={() => void live.sync()}>Try again</button></div>}
          {!loading && !loadError && merged.length === 0 && <div className="cp-empty-thread"><span className="cp-empty-art"><GroupBadge name="leaf"/><span><Icon name="chat"/></span></span><h3>A new conversation starts here.</h3><p>Say hello, share an idea, or bring your team together.</p></div>}
          {!loading && merged.map((m, i) => {
            const mine = m.sender_id === me.id;
            const prev = merged[i - 1]; const next = merged[i + 1];
            const newDay = !prev || day(prev.created_at) !== day(m.created_at);
            const first = !canGroup(prev, m);
            const last = !next || !canGroup(m, next);
            const quoted = merged.find(x => x.id === m.reply);
            const canEdit = advanced && mine && now > 0 && now - Date.parse(m.created_at) <= 900_000;
            return <Fragment key={m.id}>{i === unreadIndex && <div className="cp-date cp-unread"><span>Unread messages</span></div>}{newDay && <div className="cp-date"><span>{day(m.created_at)}</span></div>}<article tabIndex={-1} onPointerDown={event => {
                if (event.pointerType === "mouse" || m.deleted || (event.target as HTMLElement).closest("button,a")) return;
                cancelLongPress(); const element = event.currentTarget;
                longPress.current = { x:event.clientX, y:event.clientY, timer:setTimeout(() => { element.focus({preventScroll:true}); setMenu(m.id); longPress.current = null; },450) };
              }} onPointerMove={event => { const press = longPress.current; if (press && Math.hypot(event.clientX - press.x,event.clientY - press.y) > 10) cancelLongPress(); }} onPointerUp={cancelLongPress} onPointerCancel={cancelLongPress} id={`message-${m.id}`} className={`cp-message ${mine ? "mine" : "incoming"} ${first ? "first" : ""} ${last ? "last" : ""} ${highlight === m.id ? "highlight" : ""}`}>
              <div className="cp-message-avatar">{!mine && first && avatar(m.sender_id, false, "message")}</div>
              <div className="cp-message-content">{first && !mine && <div className="cp-sender">{name(m.sender_id)}</div>}
                <div className="cp-bubble" style={!mine ? { "--sender": person(m.sender_id)?.color || "var(--primary)" } as CSSProperties : undefined}>
                  {m.reply && !quoted && !m.deleted && <button className="cp-quote" onClick={()=>void jump(m.reply!)}><strong>Reply</strong><span>View original message</span></button>}{quoted && !m.deleted && <button className="cp-quote" onClick={() => jump(quoted.id)}><strong>{name(quoted.sender_id)}</strong><span>{quoted.deleted ? "Message deleted" : quoted.body || "Attachment"}</span></button>}
                  {m.deleted ? <p className="cp-deleted">This message was deleted</p> : <><p className="cp-body">{messageTextParts(m.body,(m.mentions || []).map(name)).map((part,j)=>part.kind==="link" ? <a key={j} href={part.text} target="_blank" rel="noreferrer">{isGifUrl(part.text) ? <img className="cp-gif-inline" src={part.text} alt="GIF" loading="lazy"/> : part.text.length>90 ? `${part.text.slice(0,87)}…`:part.text}</a> : part.kind==="mention" ? <span key={j} className="cp-mention">{part.text}</span> : part.text)}</p>{m.attachments?.length > 0 && <MessageAttachments supabase={supabase} attachments={m.attachments}/>}{detectShareLinks(m.body).length > 0 && <LinkPreviewCards links={detectShareLinks(m.body)}/>}</>}
                </div>
                {!!m.reactions?.length && !m.deleted && <div className="cp-reactions">{EMOJI.filter(emoji=>m.reactions?.some(r=>r.emoji===emoji)).map(emoji=>{
                  const rs=m.reactions!.filter(r=>r.emoji===emoji), mine=rs.some(r=>r.profile_id===me.id);
                  return <button key={emoji} disabled={actionBusy} title={rs.map(r=>name(r.profile_id)).join(", ")} aria-label={`${emoji}: ${rs.map(r=>name(r.profile_id)).join(", ")}. ${mine ? "Remove" : "Add"} your reaction`} aria-pressed={mine} onClick={()=>void mutate(()=>setMessageReaction(m.id,emoji,!mine))}>{emoji}<span>{rs.length}</span></button>;
                })}</div>}
                {last && <div className="cp-message-meta">{m.pinned && <Icon name="pin"/>}{m.edited && "Edited · "}{clock(m.created_at)}{mine && <><Icon name="check"/><span>{live.participants.some(p=>p.profile_id!==me.id && p.joined_at<=m.created_at && p.last_read_at>=m.created_at) ? current.type==="dm" ? "Read" : `Seen by ${live.participants.filter(p=>p.profile_id!==me.id && p.joined_at<=m.created_at && p.last_read_at>=m.created_at).length}` : "Sent"}</span></>}</div>}
              </div>
              {!m.deleted && <div className={`cp-message-actions ${menu === m.id ? "open" : ""}`}>{advanced && <Tool label={`Reply to message from ${name(m.sender_id)}`} icon="reply" onClick={() => { setReply(m); setEditing(null); input.current?.focus(); }}/>}<Tool label="Message actions" icon="more" active={menu === m.id} onClick={() => setMenu(menu === m.id ? null : m.id)}/>{menu === m.id && <MessageActionPopover onClose={() => setMenu(null)}>{advanced && <div className="cp-emoji">{EMOJI.map(emoji => <button key={emoji} aria-label={`React ${emoji}`} disabled={actionBusy} onClick={() => { void mutate(()=>setMessageReaction(m.id,emoji,!m.reactions?.some(r=>r.emoji===emoji && r.profile_id===me.id))); setMenu(null); }}>{emoji}</button>)}</div>}{advanced && (!m.pinned || m.pinnedBy===me.id || current.amAdmin) && <button disabled={actionBusy} onClick={() => { void mutate(()=>setMessagePin(m.id,!m.pinned)); setMenu(null); }}>{m.pinned ? "Unpin message" : "Pin message"}</button>}<button onClick={async () => { try { await navigator.clipboard.writeText(m.body); setNotice("Message copied."); } catch { setNotice("Clipboard unavailable. Select the message text to copy it."); } setMenu(null); }}>Copy text</button>{canEdit && <><button onClick={() => { setEditing(m); setEditText(m.body); setReply(null); setMenu(null); input.current?.focus(); }}>Edit message</button><button className="cp-danger" onClick={() => { if(window.confirm("Delete this message for everyone? A deleted-message marker will remain.")) void mutate(()=>deleteChatMessage(m.id)); setMenu(null); }}>Delete message</button></>}</MessageActionPopover>}</div>}
            </article></Fragment>;
          })}
        </div>
        {(away || live.windowed) && <button className="cp-jump" onClick={async () => { if(live.windowed) await live.latest(); scrollBottom.current = true; live.setAtBottom(true); thread.current?.scrollTo({ top: thread.current.scrollHeight, behavior: "smooth" }); setAway(false); }}>Back to latest <Icon name="down"/></button>}
        {selected && <div className="cp-composer-wrap">
          {(reply || editing) && <div className="cp-compose-context"><Icon name="reply"/><span><strong>{editing ? "Editing your message" : `Replying to ${name(reply!.sender_id)}`}</strong><small>{(editing || reply)?.body || "Attachment"}</small></span><Tool label="Cancel reply or edit" icon="close" onClick={() => { setReply(null); setEditing(null); }}/></div>}
          {files.length > 0 && <div className="cp-pending-files">{files.map((f, i) => <div key={`${f.name}-${i}`}>{f.mime.startsWith("image/") ? <img src={f.url} alt="" className="cp-pending-thumbnail"/> : <Icon name="file"/>}<span>{f.name}{sending && <small>{f.uploaded ? "Uploaded" : `${f.progress || 0}% uploaded`}</small>}</span><button aria-label={`Remove ${f.name}`} disabled={sending} onClick={() => {requestId.current=null; setFiles(fs => fs.filter((_, n) => n !== i));}}><Icon name="close"/></button></div>)}</div>}
          {suggestions.length > 0 && <div className="cp-mentions" aria-label="Mention suggestions">{suggestions.map((id, index) => <button className={index === mentionIndex ? "is-active" : ""} key={id} onClick={() => { setText(text.replace(/@[^@\n]*$/, `@${name(id)} `)); setMentionOpen(false); input.current?.focus(); }}>{avatar(id)}{name(id)}</button>)}</div>}
          <div className="cp-composer"><input ref={upload} type="file" accept={ATTACHMENT_ACCEPT} multiple hidden onChange={e => { if (e.target.files) attach(e.target.files); e.target.value = ""; }}/><button type="button" className="cp-tool" disabled={Boolean(editing) || sending || !selected} title="Attach files" aria-label="Attach files" onClick={() => upload.current?.click()}><Icon name="plus"/></button><button type="button" className={`cp-tool ${emojiOpen ? "is-active" : ""}`} disabled={sending || !selected} title="Insert emoji" aria-label="Insert emoji" aria-expanded={emojiOpen} onClick={() => emojiOpen ? closeEmoji() : openEmoji()}><Icon name="smile"/></button>{emojiOpen && <MessageActionPopover label="Insert emoji" onClose={closeEmoji}><div className="cp-emoji cp-emoji-grid">{PICKER_EMOJI.map(emoji => <button key={emoji} type="button" aria-label={`Insert ${emoji}`} onClick={() => insertEmoji(emoji)}>{emoji}</button>)}</div></MessageActionPopover>}<button type="button" className={`cp-tool ${gifOpen ? "is-active" : ""}`} disabled={Boolean(editing) || sending || !selected} title="Your GIFs" aria-label="Your GIFs" aria-expanded={gifOpen} onClick={() => setGifOpen(o => !o)}><Icon name="gif"/></button>{gifOpen && <MessageActionPopover label="Your GIFs" onClose={() => setGifOpen(false)}><GifPicker supabase={supabase} meId={me.id} onPick={file => { attach([file]); setGifOpen(false); }} onPickUrl={url => { setGifOpen(false); void sendGifLink(url); }}/></MessageActionPopover>}<textarea ref={input} rows={1} disabled={sending || !selected} aria-label="Write a message" placeholder={`Message ${title(current)}…`} value={text} onChange={e => setText(e.target.value)} onPaste={e => { if (!editing && e.clipboardData.files.length) { e.preventDefault(); attach(e.clipboardData.files); } }} onKeyDown={e => {
              if (suggestions.length && !e.nativeEvent.isComposing) {
                if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setMentionIndex(i => (i + (e.key === "ArrowDown" ? 1 : -1) + suggestions.length) % suggestions.length); return; }
                if (e.key === "Enter") { e.preventDefault(); const id = suggestions[mentionIndex % suggestions.length]; setText(text.replace(/@[^@\n]*$/, `@${name(id)} `)); setMentionOpen(false); return; }
              }
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } if (e.key === "Escape") setMentionOpen(false); }}/><button className="cp-send" aria-label={editing ? "Save edit" : "Send message"} disabled={(!text.trim() && !files.length) || loading || !ready || sending || offline || !selected} onClick={send}><Icon name={editing ? "check" : "send"}/></button></div>
          <div className="cp-composer-hint"><span><strong>@</strong> mention · Shift + Enter for a new line</span><span>{sending ? "Sending…" : ""}</span></div>
        </div>
        }
        {dragging && <div className="cp-drop-zone"><Icon name="attach"/><h3>Drop files into the conversation</h3><p>Up to 6 files · 3 MB each </p></div>}
        {panel && <aside ref={panelRef} className="cp-panel" aria-label={panel === "new" ? "New conversation" : panel === "search" ? "Conversation search" : panel === "pins" ? "Pinned messages" : "Conversation details"}>
          <div className="cp-panel-heading"><h3>{panel === "new" ? "New conversation" : panel === "search" ? "Find a message" : panel === "pins" ? "Pinned messages" : "Conversation details"}</h3><Tool label="Close panel" icon="close" onClick={() => setPanel(null)}/></div>
          <div className="cp-panel-body">
          {panel === "search" && <><label className="cp-search"><Icon name="search"/><input autoFocus aria-label="Search messages" placeholder="Search this conversation" value={threadQuery} onChange={e => { setThreadQuery(e.target.value); setMatchIndex(0); }}/></label><p className="cp-panel-caption">{searching ? "Searching…" : searchError ? searchError : threadQuery ? `${hits.length} results (latest 50 matches)` : "Find a phrase, then jump to its context."}</p>{hits.length > 0 && <div className="cp-search-navigation"><span>{matchIndex + 1} of {hits.length}</span><button aria-label="Previous search result" onClick={() => { const i = (matchIndex - 1 + hits.length) % hits.length; setMatchIndex(i); jump(hits[i].id, false); }}>Previous</button><button aria-label="Next search result" onClick={() => { const i = (matchIndex + 1) % hits.length; setMatchIndex(i); jump(hits[i].id, false); }}>Next</button></div>}{hits.map(m => <button className="cp-result" key={m.id} onClick={() => jump(m.id)}><strong>{name(m.sender_id)}</strong><p>{m.body}</p><small>{day(m.created_at)} · {clock(m.created_at)}</small></button>)}</>}
          {panel === "pins" && <><p className="cp-panel-caption">Keep decisions close to the conversation.</p>{pinned.length === 0 && <div className="cp-small-empty"><Icon name="pin"/><strong>No pinned messages yet</strong><p>Open a message’s actions and choose Pin message.</p></div>}{pinned.map(m => <div className="cp-pin-card" key={m.id}><button className="cp-result" onClick={() => jump(m.id)}><strong>{name(m.sender_id)}</strong><p>{m.body}</p><small>Jump to message</small></button><button className="cp-text-button" disabled={actionBusy || (m.pinnedBy!==me.id && !current.amAdmin)} onClick={() => void mutate(()=>setMessagePin(m.id,false))}>Unpin</button></div>)}</>}
          {panel === "info" && <><div className="cp-profile-summary">{avatar(current.type === "group" ? current.id : current.participantIds.find(id => id !== me.id) || me.id, current.type === "group", "detail")}<h3>{title(current)}</h3><p>{current.type === "group" ? `${current.participantIds.length} people in this space` : "A direct conversation"}</p></div><h4>People</h4>{current.participantIds.map(id => <div className="cp-person" key={id}>{avatar(id)}<span><strong>{name(id)}</strong><small>{id === me.id ? "You" : person(id)?.post || "Team member"}</small></span></div>)}{current.type === "group" && current.amAdmin && <form className="cp-rename" onSubmit={e => { e.preventDefault(); if(rename.trim()) void mutate(()=>renameGroup(current.id,rename.trim())); }}><label htmlFor="cp-group-name">Group name</label><input id="cp-group-name" value={rename} onChange={e => setRename(e.target.value)} maxLength={80}/><button className="cp-primary" disabled={!rename.trim()}>Save name</button></form>}{current.type==="group" && <div className="cp-group-controls">
              {current.amAdmin && <><h4>Manage members</h4>{current.participantIds.filter(id=>id!==me.id).map(id=><div className="cp-person" key={id}><span>{name(id)}</span><button disabled={actionBusy} onClick={()=>{if(window.confirm(`Remove ${name(id)} from this group?`)) void mutate(()=>removeGroupMember(current.id,id));}}>Remove</button></div>)}
              <select aria-label="Add group member" defaultValue="" disabled={actionBusy} onChange={e=>{const id=e.target.value;if(id) void mutate(()=>addGroupMembers(current.id,[id]));e.target.value="";}}><option value="">Add a member…</option>{people.filter(p=>p.active && !current.participantIds.includes(p.id)).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></>}
              <button className="cp-danger" disabled={actionBusy} onClick={async()=>{if(window.confirm("Leave this group?")) {const ok=await mutate(()=>leaveGroup(current.id));if(ok){live.select("");setPanel(null);setMobileThread(false);}}}}>Leave group</button></div>}<h4>Shared files</h4>{!merged.some(m => !m.deleted && (m.attachments?.length)) && <p className="cp-panel-caption">Files shared here will appear together.</p>}{merged.filter(m => !m.deleted).map(m => <div className="cp-shared-files" key={m.id}>{!!m.attachments?.length && <MessageAttachments supabase={supabase} attachments={m.attachments}/>}</div>)}</>}
          {panel === "new" && <><p className="cp-panel-caption">Choose one person for a direct chat, or several for a group.</p><label className="cp-search"><Icon name="search"/><input autoFocus aria-label="Find people" placeholder="Search your team" value={newQuery} onChange={e => setNewQuery(e.target.value)}/></label>{picked.length > 1 && <input className="cp-group-input" aria-label="New group name" placeholder="Give your group a name" value={groupName} onChange={e => setGroupName(e.target.value)} maxLength={80}/>}{people.filter(p => p.active && p.id !== me.id && p.name.toLowerCase().includes(newQuery.toLowerCase())).map(p => <label className="cp-person cp-select-person" key={p.id}>{avatar(p.id)}<span>{p.name}</span><input type="checkbox" checked={picked.includes(p.id)} onChange={() => setPicked(ids => ids.includes(p.id) ? ids.filter(id => id !== p.id) : [...ids, p.id])}/></label>)}<button className="cp-primary" disabled={actionBusy || !picked.length || (picked.length > 1 && !groupName.trim())} onClick={startConversation}>{picked.length > 1 ? `Create group (${picked.length})` : "Start conversation"}</button></>}
          </div>
        </aside>}
      </section>
    </div>
    {notice && <div className="cp-toast" role="status">{notice}</div>}
  </section>;
}
