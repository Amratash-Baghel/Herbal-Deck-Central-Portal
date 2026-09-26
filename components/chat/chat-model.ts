// Typed into the message body, so unlike reactions this is not capped by the database check constraint.
export const PICKER_EMOJI = ["😀","😃","😄","😁","😅","😂","🙂","😉","😊","😇","🥰","😍","😘","😋","😎","🤩","🤔","🤗","🙃","😴","😐","😢","😭","😤","😱","🤯","🥳","😬","🙄","😷","👍","👎","👌","🙏","👏","🙌","💪","🤝","👋","✌️","❤️","🧡","💚","💙","💜","🔥","✨","⭐","🎉","🎊","💯","✅","❌","⚠️","📌","📎","📅","⏰","☕","🌿","🌱","🍀","🚀","💡"];
export type GroupableMessage = { id: string; sender_id: string; conversation_id: string; created_at: string };
// Built once: constructing an Intl formatter costs ~50x more than using one, and
// the conversation list formats a date per row on every render. (Self-contained
// rather than imported from lib/time so node's test runner can load this file.)
const CONVERSATION_DATE = new Intl.DateTimeFormat("en-IN", {month:"short",day:"numeric",timeZone:"Asia/Kolkata"});
export function formatConversationDate(date:string):string {
  return CONVERSATION_DATE.format(new Date(date));
}
export function messageTextParts(body:string, mentions:string[]):{text:string;kind:"text"|"link"|"mention"}[] {
  const names=mentions.filter(Boolean).sort((a,b)=>b.length-a.length);
  const parts:{text:string;kind:"text"|"link"|"mention"}[]=[];
  let cursor=0,plain="";
  while(cursor<body.length) {
    const rest=body.slice(cursor);
    const url=rest.match(/^https?:\/\/[^\s]+/)?.[0];
    const mention=names.find(name=>rest.startsWith("@"+name));
    const token=url || (mention ? "@"+mention : "");
    if(token) {
      if(plain) {parts.push({text:plain,kind:"text"});plain="";}
      parts.push({text:token,kind:url ? "link":"mention"});cursor+=token.length;
    } else {plain+=body[cursor];cursor++;}
  }
  if(plain) parts.push({text:plain,kind:"text"});
  return parts;
}
export function canGroup(a: GroupableMessage | undefined, b: GroupableMessage): boolean {
  if (!a || a.sender_id !== b.sender_id || a.conversation_id !== b.conversation_id) return false;
  const first = new Date(a.created_at); const second = new Date(b.created_at);
  const gap = second.getTime() - first.getTime();
  return first.toDateString() === second.toDateString() && gap >= 0 && gap <= 300_000;
}
export function isNearBottom(top: number, height: number, total: number) { return total - top - height <= 96; }
/** A link that points straight at a .gif file, so it can render inline. */
export function isGifUrl(url: string): boolean { return /^https:\/\/[^\s]+\.gif(\?[^\s]*)?$/i.test(url); }
/** A message preview for lists and notifications: a GIF sent as a link reads as "GIF", not a CDN URL. */
export function previewText(text: string): string { return isGifUrl(text.trim()) ? "GIF" : text; }
/** Splice text into a caret position or over a selection, clamped to the text. */
export function insertAt(text: string, start: number, end: number, insert: string): string {
  const from = Math.max(0, Math.min(start, text.length));
  const to = Math.max(from, Math.min(end, text.length));
  return text.slice(0, from) + insert + text.slice(to);
}
export function mergeMessages<T extends GroupableMessage>(existing: T[], incoming: T[]): T[] {
  return [...new Map([...existing, ...incoming].map(m => [m.id, m])).values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}
