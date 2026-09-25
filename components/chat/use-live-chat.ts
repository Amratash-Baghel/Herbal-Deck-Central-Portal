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
  const [windowed,setWindowed] = useState(false);
  const windowedRef = useRef(false);
  const selectedRef = useRef(selected);
  const messagesRef = useRef(base);
  const generation = useRef(0);
  const capability = useRef(false);
  const syncSequence = useRef(0);
  const atBottom = useRef(true);
  const lastMarked = useRef("");
  const activeOnScreen = useRef(Boolean(initialId));
  useEffect(() => { messagesRef.current = base; },[base]);

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

  const markRead = useCallback(async () => {
    const id = selectedRef.current;
    const latest = messagesRef.current.at(-1);
    if (!id || !latest || latest.conversation_id!==id || windowedRef.current || !atBottom.current || !activeOnScreen.current || !portalIsFocused() || lastMarked.current===latest.id) return;
    const result = capability.current
      ? await supabase.rpc("mark_chat_read_through",{conv_id:id,message_id:latest.id})
      : await supabase.rpc("mark_conversation_read",{conv_id:id});
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
      const oldIds = initialLoad ? [] : messagesRef.current.filter(m=>m.conversation_id===id && !rows.some(n=>n.id===m.id)).map(m=>m.id);
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
      const rows=await enrich([message]);
      if(selectedRef.current===message.conversation_id) {syncSequence.current++;setBase(ms=>mergeMessages(ms,rows));}
    }
    void refreshConversations();
  },[enrich,refreshConversations]);

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
    const mergeIncoming=async(message:Message)=>{
      if(!inOpenThread(message) || (windowedRef.current && !messagesRef.current.some(m=>m.id===message.id))) return;
      const rows=await enrich([message]);
      if(inOpenThread(message)) {syncSequence.current++;setBase(ms=>mergeMessages(ms,rows));}
    };
    const channel=supabase.channel(`chat-live-${meId}`);
    channel.on("postgres_changes",{event:"INSERT",schema:"public",table:"messages"},payload=>{
      if(inOpenThread(payload.new)) void mergeIncoming(payload.new as Message); else queueList();
    });
    // Edits and soft-deletes: re-sync only when they touch the thread on screen.
    channel.on("postgres_changes",{event:"UPDATE",schema:"public",table:"messages"},payload=>{
      if(inOpenThread(payload.new)) refresh(); else queueList();
    });
    channel.on("postgres_changes",{event:"DELETE",schema:"public",table:"messages"},refresh);
    channel.on("postgres_changes",{event:"*",schema:"public",table:"conversations"},queueList);
    // Membership, reactions and pins can't be placed from the event alone.
    for(const table of ["conversation_participants","message_reactions","conversation_pins"])
      channel.on("postgres_changes",{event:"*",schema:"public",table},refresh);
    channel.on("postgres_changes",{event:"UPDATE",schema:"public",table:"profiles"},()=>{
      void supabase.from("profiles").select("id,full_name,email,deactivated_at,color,avatar_path,post").then(({data,error})=>{
        if(!error && data) setDirectory(data.map(p=>({id:p.id,name:p.full_name||p.email,email:p.email,active:!p.deactivated_at,color:p.color,avatarPath:p.avatar_path,post:p.post})));
      });
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
    return ()=>{clearTimeout(syncTimer);clearTimeout(listTimer);clearInterval(interval);void supabase.removeChannel(channel);window.removeEventListener("online",onReturn);window.removeEventListener("focus",onReturn);document.removeEventListener("visibilitychange",onReturn);};
  },[supabase,meId,sync,refreshConversations,markRead,enrich]);
  useEffect(()=>{void markRead();},[base,markRead]);
  useEffect(()=>()=>setActiveConversation(null),[setActiveConversation]);
  const setAtBottom = (value:boolean) => {atBottom.current=value;setActiveConversation(value && !windowedRef.current ? selectedRef.current || null : null);};
  return {supabase,conversations,directory,selected,base,loading,loadError,advanced,connection,participants,unreadAfter,pinnedMessages,windowed,hasOlder,olderBusy,select,sync,loadOlder,accept,refreshConversations,markRead,setAtBottom,showMessage,latest};
}
