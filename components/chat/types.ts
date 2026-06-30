import type { ConversationType } from "@/lib/types";

/** A person in the company directory, used for names and the people pickers. */
export interface DirectoryEntry {
  id: string;
  name: string;
  email: string;
  /** False for soft-removed employees — shown for history, not pickable. */
  active: boolean;
}

/** A conversation as the chat client tracks it (a row + derived display data). */
export interface ConversationSummary {
  id: string;
  type: ConversationType;
  name: string | null;
  participantIds: string[];
  /** Whether the signed-in user is an admin of this group. */
  amAdmin: boolean;
  unread: number;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
}
