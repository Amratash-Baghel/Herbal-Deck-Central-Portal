"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { mergeMessages } from "./chat-model";
import { useNotifications } from "@/components/notifications/notifications-provider";
import { portalIsFocused } from "@/lib/desktop-notifications";
import type { Message } from "@/lib/types";
import type { ConversationSummary, DirectoryEntry } from "./types";

export type Reaction = {message_id:string; profile_id:string; emoji:string};
export type Participant = {profile_id:string; last_read_at:string; joined_at:string; is_admin:boolean};
export type LiveMessage = Message & {reply?:string; edited?:boolean; deleted?:boolean; reactions?:Reaction[]; pinned?:boolean; pinnedBy?:string};
export function useLiveChat(meId:string, initial:ConversationSummary[], initialDirectory:DirectoryEntry[], initialId?:string) {
  const [supabase] = useState(() => createClient());
  const {markConversationRead,setActiveConversation} = useNotifications();
  const [conversations,setConversations] = useState(initial);
  const [directory,setDirectory] = useState(initialDirectory);
  const [selected,setSelected] = useState(initialId || "");
  const [base,setBase] = useState<LiveMessage[]>([]);
  const [participants,setParticipants] = useState<Participant[]>([]);
  const [loading,setLoading] = useState(false);
  const [loadError,setLoadError] = useState("");
  const [advanced,setAdvanced] = useState(false);
  const [connection,setConnection] = useState("Connecting");
  const [hasOlder,setHasOlder] = useState(false);
  const [olderBusy,setOlderBusy] = useState(false);
  const [unreadAfter,setUnreadAfter] = useState<string | null>(null);
  const [pinnedMessages,setPinnedMessages] = useState<LiveMessage[]>([]);
  const pinnedRef = useRef(pinnedMessages);
  useEffect(() => { pinnedRef.current = pinnedMessages; },[pinnedMessages]);
  const [windowed,setWindowed] = useState(false);
  const windowedRef = useRef(false);
  const selectedRef = useRef(selected);
  const messagesRef = useRef(base);
  const generation = useRef(0);
  const capability = useRef(false);
  const syncSequence = useRef(0);
  const atBottom = useRef(true);
  const lastMarked = useRef("");
  const marking = useRef("");
  const activeOnScreen = useRef(Boolean(initialId));
  const participantsRef = useRef(participants);
  const conversationsRef = useRef(conversations);
  useEffect(() => { messagesRef.current = base; },[base]);
  useEffect(() => { participantsRef.current = participants; },[participants]);
  useEffect(() => { conversationsRef.current = conversations; },[conversations]);

  const refreshConversations = useCallback(async () => {
    const [cs,ps,counts] = await Promise.all([
      supabase.from("conversations").select("*"),
      supabase.from("conversation_participants").select("conversation_id,profile_id,is_admin"),
      supabase.rpc("unread_counts"),
    ]);
    if (cs.error || ps.error || counts.error) return;
    const list:ConversationSummary[] = (cs.data || []).map(c => ({
      id:c.id,type:c.type,name:c.name,
      participantIds:(ps.data || []).filter(p=>p.conversation_id===c.id).map(p=>p.profile_id),
      amAdmin:(ps.data || []).some(p=>p.conversation_id===c.id && p.profile_id===meId && p.is_admin),
      unread:Number((counts.data || []).find((u:{conversation_id:string})=>u.conversation_id===c.id)?.unread || 0),
      lastMessageAt:c.last_message_at,lastMessagePreview:c.last_message_preview,
    }));
    list.sort((a,b)=>(b.lastMessageAt || "").localeCompare(a.lastMessageAt || "") || a.id.localeCompare(b.id));
    setConversations(list);
    if (selectedRef.current && !list.some(c=>c.id===selectedRef.current)) {
      selectedRef.current=""; generation.current++; messagesRef.current=[];setSelected(""); setBase([]); setPinnedMessages([]);setParticipants([]);setLoading(false);setUnreadAfter(null);setActiveConversation(null);
    }
  },[supabase,meId,setActiveConversation]);

  const enrich = useCallback(async (messages:Message[]):Promise<LiveMessage[]> => {
    if (!capability.current || !messages.length) return messages;
    const ids = messages.map(m=>m.id);
    const [reactions,pins] = await Promise.all([
      supabase.from("message_reactions").select("*").in("message_id",ids),
      supabase.from("conversation_pins").select("*").in("message_id",ids),
    ]);
    if (reactions.error || pins.error) throw new Error("Could not refresh message actions.");
    return messages.map(m=>({
      ...m,reply:m.reply_to_id || undefined,edited:Boolean(m.edited_at),deleted:Boolean(m.deleted_at),
      reactions:(reactions.data || []).filter(r=>r.message_id===m.id) as Reaction[],
      pinned:(pins.data || []).some(p=>p.message_id===m.id),
      pinnedBy:(pins.data || []).find(p=>p.message_id===m.id)?.pinned_by,
    }));
  },[supabase]);

  /**
   * The shape enrich() gives a message, built from the row alone. Right for a
   * message that has just been created (nobody can have reacted to or pinned
   * it yet) and for a new version of one already on screen, whose reactions
   * and pin carry over — so neither costs the two lookups enrich() makes.
   */
  const fresh = useCallback((message:Message, existing?:LiveMessage):LiveMessage => {
    if (!capability.current) return message;
    return {...message,reply:message.reply_to_id || undefined,edited:Boolean(message.edited_at),deleted:Boolean(message.deleted_at),
      reactions:existing?.reactions ?? [],pinned:existing?.pinned ?? false,pinnedBy:existing?.pinnedBy};
  },[]);

  const markRead = useCallback(async () => {
    const id = selectedRef.current;
    const latest = messagesRef.current.at(-1);
    if (!id || !latest || latest.conversation_id!==id || windowedRef.current || !atBottom.current || !activeOnScreen.current || !portalIsFocused() || lastMarked.current===latest.id || marking.current===latest.id) return;
    marking.current = latest.id;
    const result = await (capability.current
      ? supabase.rpc("mark_chat_read_through",{conv_id:id,message_id:latest.id})
      : supabase.rpc("mark_conversation_read",{conv_id:id})).then(r => r, () => ({error:true}));
    if (marking.current===latest.id) marking.current = "";
    if (!result.error && selectedRef.current===id) {
      lastMarked.current=latest.id; markConversationRead(id);
      setConversations(cs=>cs.map(c=>c.id===id ? {...c,unread:0}:c));
    }
  },[supabase,markConversationRead]);

  const sync = useCallback(async (initialLoad=false) => {
    const id = selectedRef.current, gen = generation.current, seq = ++syncSequence.current;
    if (!id) return;
    const valid = () => selectedRef.current===id && generation.current===gen && syncSequence.current===seq;
    try {
      // Verify membership before exposing cached content after a reconnect.
      const parts = await supabase.from("conversation_participants").select("profile_id,last_read_at,joined_at,is_admin").eq("conversation_id",id);
      if (!valid()) return;
      if (parts.error) throw new Error("Could not load conversation members.");
      if (!parts.data?.some(p=>p.profile_id===meId)) {
        selectedRef.current="";generation.current++;messagesRef.current=[];setSelected(""); setBase([]);setPinnedMessages([]);setParticipants([]);setLoading(false);setUnreadAfter(null);setActiveConversation(null);
        setLoadError("This conversation is no longer available."); return;
      }
      setParticipants(parts.data as Participant[]);
      if (initialLoad) setUnreadAfter(parts.data.find(p=>p.profile_id===meId)?.last_read_at || null);
      if(capability.current) {
        const pins=await supabase.from("conversation_pins").select("message_id,pinned_by,messages!inner(*)").eq("messages.conversation_id",id).order("created_at",{ascending:false}).limit(100);
        if(pins.error) throw new Error("Could not refresh pinned messages.");
        if(valid()) setPinnedMessages((pins.data || []).flatMap(p=>{
          const message = p.messages as unknown as Message;
          return message && !message.deleted_at ? [{...message,pinned:true,pinnedBy:p.pinned_by}]:[];
        }));
      }
      if(windowedRef.current && !initialLoad) {
        const ids=messagesRef.current.map(m=>m.id);
        if(ids.length) {
          const result=await supabase.from("messages").select("*").eq("conversation_id",id).in("id",ids);
          if(result.error) throw new Error("Could not refresh history.");
          const rows=await enrich((result.data || []) as Message[]);
          if(valid()) {setBase(mergeMessages([],rows));setLoadError("");}
        }
        return;
      }
      const result = await supabase.from("messages").select("*").eq("conversation_id",id)
        .order("created_at",{ascending:false}).order("id",{ascending:false}).limit(50);
      if (result.error) throw new Error("Could not load messages. Your draft is safe.");
      let rows = (result.data || []) as Message[];
      // Refresh old loaded IDs too: edits/deletions do not change created_at.
      // (One chunk at a time on purpose: a deep history is dozens of chunks,
      // and firing them all at once would burst the small PostgREST pool.)
      const latestIds = new Set(rows.map(n=>n.id));
      const oldIds = initialLoad ? [] : messagesRef.current.filter(m=>m.conversation_id===id && !latestIds.has(m.id)).map(m=>m.id);
      for (let i=0;i<oldIds.length;i+=100) {
        const older = await supabase.from("messages").select("*").eq("conversation_id",id).in("id",oldIds.slice(i,i+100));
        if (older.error) throw new Error("Could not refresh history.");
        rows=rows.concat(older.data || []);
      }
      const enriched:LiveMessage[]=[];
      for(let i=0;i<rows.length;i+=100) enriched.push(...await enrich(rows.slice(i,i+100)));
      if (!valid()) return;
      setBase(mergeMessages([],enriched)); setLoadError("");
      if (initialLoad) setHasOlder((result.data?.length || 0)===50);
    } catch(e) { if(valid()) setLoadError(e instanceof Error ? e.message : "Could not refresh messages."); }
    finally { if(valid()) setLoading(false); }
  },[supabase,meId,enrich,setActiveConversation]);

  const refreshPins = useCallback(async () => {
    const id = selectedRef.current, gen = generation.current;
    if (!id || !capability.current) return;
    const pins=await supabase.from("conversation_pins").select("message_id,pinned_by,messages!inner(*)").eq("messages.conversation_id",id).order("created_at",{ascending:false}).limit(100);
    if (pins.error || selectedRef.current!==id || generation.current!==gen) return;
    setPinnedMessages((pins.data || []).flatMap(p=>{
      const message = p.messages as unknown as Message;
      return message && !message.deleted_at ? [{...message,pinned:true,pinnedBy:p.pinned_by}]:[];
    }));
  },[supabase]);

  const refreshParticipants = useCallback(async () => {
    const id = selectedRef.current, gen = generation.current;
    if (!id) return;
    const parts = await supabase.from("conversation_participants").select("profile_id,last_read_at,joined_at,is_admin").eq("conversation_id",id);
    if (parts.error || !parts.data || selectedRef.current!==id || generation.current!==gen) return;
    setParticipants(parts.data as Participant[]);
  },[supabase]);

  const select = useCallback((id:string) => {
    generation.current++; selectedRef.current=id; messagesRef.current=[]; lastMarked.current="";windowedRef.current=false;setWindowed(false);setPinnedMessages([]);
    setSelected(id); setBase([]); setParticipants([]); setUnreadAfter(null); setLoading(Boolean(id)); setHasOlder(false); setOlderBusy(false);
    activeOnScreen.current=Boolean(id); atBottom.current=true;
    setActiveConversation(id || null);
    window.history.replaceState(null,"",id ? `/chat?c=${encodeURIComponent(id)}` : "/chat");
    void sync(true);
  },[sync,setActiveConversation]);

  const showMessage = useCallback(async (messageId:string) => {
    const id=selectedRef.current, gen=generation.current;
    const target=await supabase.from("messages").select("*").eq("conversation_id",id).eq("id",messageId).maybeSingle();
    if(target.error || !target.data || generation.current!==gen) return false;
    const stamp=target.data.created_at;
    const [before,after]=await Promise.all([
      supabase.from("messages").select("*").eq("conversation_id",id).or(`created_at.lt.${stamp},and(created_at.eq.${stamp},id.lt.${messageId})`).order("created_at",{ascending:false}).order("id",{ascending:false}).limit(25),
      supabase.from("messages").select("*").eq("conversation_id",id).or(`created_at.gt.${stamp},and(created_at.eq.${stamp},id.gt.${messageId})`).order("created_at").order("id").limit(25),
    ]);
    if(before.error || after.error || generation.current!==gen) return false;
    const rows=await enrich([...(before.data || []),target.data,...(after.data || [])] as Message[]);
    if(generation.current!==gen) return false;
    syncSequence.current++;windowedRef.current=true;setWindowed(true);atBottom.current=false;
    setBase(mergeMessages([],rows));setHasOlder((before.data?.length || 0)===25);return true;
  },[supabase,enrich]);
  const latest = useCallback(async()=>{
    windowedRef.current=false;setWindowed(false);atBottom.current=true;setLoading(true);
    messagesRef.current=[];await sync(true);
  },[sync]);

  const loadOlder = useCallback(async () => {
    const first = messagesRef.current[0], id=selectedRef.current,gen=generation.current;
    if (!first || !id || olderBusy) return;
    setOlderBusy(true);
    try {
      const result = await supabase.from("messages").select("*").eq("conversation_id",id)
        .or(`created_at.lt.${first.created_at},and(created_at.eq.${first.created_at},id.lt.${first.id})`)
        .order("created_at",{ascending:false}).order("id",{ascending:false}).limit(50);
      if(result.error) throw new Error("Could not load older messages.");
      const rows=await enrich((result.data || []) as Message[]);
      if(selectedRef.current===id && generation.current===gen) { syncSequence.current++;setBase(ms=>mergeMessages(ms,rows)); setHasOlder(rows.length===50); }
    } catch(e) { if(generation.current===gen) setLoadError(e instanceof Error ? e.message : "Could not load history."); }
    finally { if(generation.current===gen) setOlderBusy(false); }
  },[supabase,enrich,olderBusy]);

  const accept = useCallback(async (message:Message) => {
    if (selectedRef.current===message.conversation_id && (!windowedRef.current || messagesRef.current.some(m=>m.id===message.id))) {
      syncSequence.current++;setBase(ms=>mergeMessages(ms,[fresh(message,ms.find(m=>m.id===message.id))]));
    }
    void refreshConversations();
  },[fresh,refreshConversations]);

  useEffect(() => {
    let cancelled=false;
    void (async()=>{
      const result=await supabase.rpc("chat_capabilities");
      if(cancelled) return;
      capability.current=!result.error && result.data===1; setAdvanced(capability.current);
      if(selectedRef.current) {setLoading(true); void sync(true);}
    })();
    return ()=>{cancelled=true;};
  },[supabase,sync]);
  useEffect(() => {
    // Realtime already pushes every change, so each one is applied as narrowly
    // as it allows. A full re-sync of the open thread (its latest page, pins,
    // reactions and members) re-downloads dozens of rows per participant, so it
    // is kept for changes that can't be applied piecemeal, for reconnects, and
    // as a slow safety net — not for every message someone sends.
    let syncTimer:ReturnType<typeof setTimeout> | undefined;
    let listTimer:ReturnType<typeof setTimeout> | undefined;
    let connected=false;
    let lastFull=0;
    const queueList=()=>{ clearTimeout(listTimer); listTimer=setTimeout(()=>{void refreshConversations();},200); };
    const refresh=()=>{ lastFull=Date.now(); clearTimeout(syncTimer); syncTimer=setTimeout(()=>{void sync();},200); queueList(); };
    const inOpenThread=(row:unknown)=>Boolean(selectedRef.current) && (row as {conversation_id?:string} | null)?.conversation_id===selectedRef.current;
    // A new message in the open thread arrives complete in the event payload, so
    // merge it directly. The list (order, preview, unread) follows from the
    // conversations UPDATE that the message trigger fires alongside it.
    const mergeIncoming=(message:Message)=>{
      if(!inOpenThread(message) || messagesRef.current.some(m=>m.id===message.id)) return; // already on screen (e.g. our own send)
      if(windowedRef.current) return;
      syncSequence.current++;setBase(ms=>ms.some(m=>m.id===message.id) ? ms : mergeMessages(ms,[fresh(message)]));
    };
    const channel=supabase.channel(`chat-live-${meId}`);
    channel.on("postgres_changes",{event:"INSERT",schema:"public",table:"messages"},payload=>{
      if(inOpenThread(payload.new)) mergeIncoming(payload.new as Message); else queueList();
    });
    // Edits and soft-deletes: re-sync only when they touch the thread on screen.
    channel.on("postgres_changes",{event:"UPDATE",schema:"public",table:"messages"},payload=>{
      if(inOpenThread(payload.new)) refresh(); else queueList();
    });
    channel.on("postgres_changes",{event:"DELETE",schema:"public",table:"messages"},refresh);
    channel.on("postgres_changes",{event:"*",schema:"public",table:"conversations"},queueList);

    // Membership and read receipts. A read (a participants UPDATE) used to
    // re-sync the whole open thread for every member who had chat open — one
    // group message cost each viewer ~150 requests. The payload carries the
    // full row, so it is applied in place. Other people's reads only matter in
    // the open thread, and those arrive on the thread channel below (filtered
    // server-side to that conversation); here only MY rows come through.
    const patchParticipant=(row:Participant & {conversation_id:string})=>{
      if(row.conversation_id!==selectedRef.current) return false;
      if(!participantsRef.current.some(p=>p.profile_id===row.profile_id)) return false;
      setParticipants(ps=>ps.map(p=>p.profile_id===row.profile_id ? {...p,last_read_at:row.last_read_at,joined_at:row.joined_at,is_admin:row.is_admin}:p));
      return true;
    };
    channel.on("postgres_changes",{event:"UPDATE",schema:"public",table:"conversation_participants",filter:`profile_id=eq.${meId}`},payload=>{
      const row=payload.new as Participant & {conversation_id:string};
      if(row.profile_id!==meId) return;
      const known=participantsRef.current.find(p=>p.profile_id===meId);
      // My own read of the thread on screen: markRead has already cleared its
      // unread count. Anything else (a read on another device, an admin
      // change) moves the list.
      if(row.conversation_id===selectedRef.current && known && known.is_admin===row.is_admin) patchParticipant(row);
      else { patchParticipant(row); queueList(); }
    });
    channel.on("postgres_changes",{event:"INSERT",schema:"public",table:"conversation_participants"},payload=>{
      const row=payload.new as Participant & {conversation_id:string};
      if(row.conversation_id===selectedRef.current && row.profile_id!==meId) setParticipants(ps=>ps.some(p=>p.profile_id===row.profile_id) ? ps : [...ps,{profile_id:row.profile_id,last_read_at:row.last_read_at,joined_at:row.joined_at,is_admin:row.is_admin}]);
      queueList();
    });
    // DELETE events skip RLS, so they reach every chat client: ignore the ones
    // for conversations this person isn't in.
    channel.on("postgres_changes",{event:"DELETE",schema:"public",table:"conversation_participants"},payload=>{
      const old=payload.old as {conversation_id?:string;profile_id?:string};
      if(!old.conversation_id || !old.profile_id) { refresh(); return; }
      if(old.profile_id===meId) { if(old.conversation_id===selectedRef.current) refresh(); else queueList(); return; }
      if(old.conversation_id===selectedRef.current) setParticipants(ps=>ps.filter(p=>p.profile_id!==old.profile_id));
      if(conversationsRef.current.some(c=>c.id===old.conversation_id)) queueList();
    });

    // Reactions carry their whole key (message, person, emoji) in the payload,
    // so they are added or removed on the loaded message directly. One for a
    // message that isn't loaded changes nothing on screen.
    channel.on("postgres_changes",{event:"*",schema:"public",table:"message_reactions"},payload=>{
      if(!capability.current) return;
      const add=payload.eventType==="INSERT", r=(add ? payload.new : payload.old) as Partial<Reaction>;
      if(!r.message_id || !r.profile_id || !r.emoji) { if(payload.eventType!=="UPDATE") refresh(); return; }
      if(!messagesRef.current.some(m=>m.id===r.message_id)) return;
      const same=(x:Reaction)=>x.message_id===r.message_id && x.profile_id===r.profile_id && x.emoji===r.emoji;
      setBase(ms=>ms.map(m=>{
        if(m.id!==r.message_id) return m;
        const list=m.reactions ?? [];
        if(add) return list.some(same) ? m : {...m,reactions:[...list,{message_id:r.message_id!,profile_id:r.profile_id!,emoji:r.emoji!}]};
        return list.some(same) ? {...m,reactions:list.filter(x=>!same(x))} : m;
      }));
    });
    // Pins: flag the loaded message at once; the pinned strip needs the pinned
    // message's text, so re-read just that list (one query, not a re-sync).
    let pinsTimer:ReturnType<typeof setTimeout> | undefined;
    const queuePins=()=>{ clearTimeout(pinsTimer); pinsTimer=setTimeout(()=>{void refreshPins();},200); };
    channel.on("postgres_changes",{event:"*",schema:"public",table:"conversation_pins"},payload=>{
      if(!capability.current || !selectedRef.current) return;
      const pinned=payload.eventType==="INSERT", row=(pinned ? payload.new : payload.old) as {message_id?:string;pinned_by?:string};
      if(!row.message_id) { queuePins(); return; }
      const loaded=messagesRef.current.some(m=>m.id===row.message_id);
      // An unpin (DELETE, which skips RLS) of something neither loaded here nor
      // in this thread's pinned list can't change what's on screen.
      if(!pinned && !loaded && !pinnedRef.current.some(m=>m.id===row.message_id)) return;
      if(loaded) setBase(ms=>ms.map(m=>m.id===row.message_id ? {...m,pinned,pinnedBy:pinned ? row.pinned_by : undefined}:m));
      queuePins();
    });
    // A profile edit arrives as the full row, so patch that one person rather
    // than every chat client re-downloading the whole directory.
    channel.on("postgres_changes",{event:"UPDATE",schema:"public",table:"profiles"},payload=>{
      const p=payload.new as {id?:string;full_name:string|null;email:string;deactivated_at:string|null;color:string|null;avatar_path:string|null;post:string|null};
      if(!p?.id || !p.email) return;
      const entry={id:p.id,name:p.full_name||p.email,email:p.email,active:!p.deactivated_at,color:p.color,avatarPath:p.avatar_path,post:p.post};
      setDirectory(d=>d.some(x=>x.id===entry.id) ? d.map(x=>x.id===entry.id ? entry : x) : [...d,entry]);
    });
    channel.subscribe(status=>{
      connected=status==="SUBSCRIBED";
      setConnection(connected ? "Connected" : "Reconnecting");
      // Catch up on anything missed while the socket was down.
      if(connected) refresh();
    });
    // Coming back to the tab re-syncs only if realtime is down or it has been a
    // while; alt-tabbing back after a few seconds has missed nothing.
    const onReturn=()=>{
      if(!portalIsFocused()) return;
      if(!connected || Date.now()-lastFull>60_000) refresh();
      void markRead();
    };
    // Polling is a fallback for a dead socket, plus a slow safety net for an
    // event realtime might drop — not the way changes normally arrive.
    const interval=setInterval(()=>{
      if(!portalIsFocused()) return;
      if(!connected || Date.now()-lastFull>300_000) refresh();
    },15000);
    window.addEventListener("online",onReturn); window.addEventListener("focus",onReturn); document.addEventListener("visibilitychange",onReturn);
    return ()=>{clearTimeout(syncTimer);clearTimeout(listTimer);clearTimeout(pinsTimer);clearInterval(interval);void supabase.removeChannel(channel);window.removeEventListener("online",onReturn);window.removeEventListener("focus",onReturn);document.removeEventListener("visibilitychange",onReturn);};
  },[supabase,meId,sync,refreshConversations,markRead,fresh,refreshPins]);
  // Other members' read receipts for the conversation on screen, filtered by
  // the realtime server so a client only receives the reads it can display
  // (the "Seen by" line of the open thread) — not every read in every group it
  // belongs to. On (re)joining, re-read the members once to cover the gap.
  useEffect(()=>{
    if(!selected) return;
    const channel=supabase.channel(`chat-thread-${meId}-${selected}`);
    channel.on("postgres_changes",{event:"UPDATE",schema:"public",table:"conversation_participants",filter:`conversation_id=eq.${selected}`},payload=>{
      const row=payload.new as Participant & {conversation_id:string};
      if(row.conversation_id!==selectedRef.current || !participantsRef.current.some(p=>p.profile_id===row.profile_id)) return;
      setParticipants(ps=>ps.map(p=>p.profile_id===row.profile_id ? {...p,last_read_at:row.last_read_at,joined_at:row.joined_at,is_admin:row.is_admin}:p));
    });
    channel.subscribe(status=>{ if(status==="SUBSCRIBED") void refreshParticipants(); });
    return ()=>{void supabase.removeChannel(channel);};
  },[supabase,meId,selected,refreshParticipants]);
  useEffect(()=>{void markRead();},[base,markRead]);
  useEffect(()=>()=>setActiveConversation(null),[setActiveConversation]);
  const setAtBottom = (value:boolean) => {atBottom.current=value;setActiveConversation(value && !windowedRef.current ? selectedRef.current || null : null);};
  return {supabase,conversations,directory,selected,base,loading,loadError,advanced,connection,participants,unreadAfter,pinnedMessages,windowed,hasOlder,olderBusy,select,sync,loadOlder,accept,refreshConversations,markRead,setAtBottom,showMessage,latest};
}
