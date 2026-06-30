-- ===========================================================================
-- Migration 0005 — Chat & Notifications
-- ===========================================================================
-- Run this ONCE in the Supabase SQL Editor, AFTER migrations 0002–0004. It is
-- additive and safe to run on the live database.
--
-- Adds the Chat module (Phase 4) and a portal-wide notification system:
--   1. conversations            — a DM (two people) or a named group
--   2. conversation_participants — who is in a conversation (+ group admins,
--                                  read cursor for unread counts)
--   3. messages                 — a message in a conversation (+ @mentions)
--   4. notifications            — per-user inbox (new DMs, @mentions, a new
--                                  invoice posted, being added to a group)
--   5. SECURITY DEFINER helpers — membership checks that avoid RLS recursion,
--                                  a read-cursor setter, and an unread tally
--   6. a trigger that keeps each conversation's "last message" summary current
--   7. Row Level Security for everything above
--   8. realtime publication for live messages + notifications
--   9. broadens profiles read access so the team can address each other (chat
--      needs a directory of names) — writes stay locked down
--
-- NOTE ON FILES: chat does not handle uploads in this phase — files are shared
-- via links (e.g. Google Drive) pasted into messages. The storage layer remains
-- available for later. No new buckets are created here.
-- ===========================================================================

-- 1. Conversations ----------------------------------------------------------
-- A conversation is either a direct message ('dm', exactly two people) or a
-- 'group' (a named, multi-person chat). The denormalised last_message_* columns
-- let the conversation list render previews and order by recency without an
-- extra join or aggregate — they are maintained by a trigger (see §6).
create table if not exists public.conversations (
  id                   uuid primary key default gen_random_uuid(),
  type                 text not null check (type in ('dm', 'group')),
  name                 text,                       -- group name; null for a DM
  created_by           uuid not null references public.profiles(id) on delete restrict,
  last_message_at      timestamptz,
  last_message_preview text,
  created_at           timestamptz not null default now()
);

-- 2. Participants -----------------------------------------------------------
-- is_admin marks a group's managers (can rename it and add/remove members);
-- last_read_at is the per-user read cursor used to compute unread counts.
create table if not exists public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  profile_id      uuid not null references public.profiles(id)      on delete cascade,
  is_admin        boolean     not null default false,
  last_read_at    timestamptz not null default now(),
  joined_at       timestamptz not null default now(),
  primary key (conversation_id, profile_id)
);

create index if not exists conv_participants_profile_idx
  on public.conversation_participants(profile_id);

-- 3. Messages ---------------------------------------------------------------
-- mentions holds the profile ids that were @-pinged in the message body, so the
-- send action can raise a 'mention' notification for each of them.
create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id       uuid not null references public.profiles(id)      on delete restrict,
  body            text not null,
  mentions        uuid[] not null default '{}',
  created_at      timestamptz not null default now()
);

create index if not exists messages_conversation_idx
  on public.messages(conversation_id, created_at);

-- 4. Notifications ----------------------------------------------------------
-- A per-user inbox. Rows are only ever written server-side (via the service-role
-- client or SECURITY DEFINER code) — there is deliberately no INSERT policy, so
-- the anon/browser client can never fabricate a notification for someone else.
create table if not exists public.notifications (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  type         text not null,            -- 'message' | 'mention' | 'invoice_posted' | 'group_added'
  title        text not null,
  body         text not null default '',
  link         text,                     -- where clicking the notification goes
  data         jsonb,                    -- structured payload (e.g. conversation_id)
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists notifications_recipient_idx
  on public.notifications(recipient_id, created_at desc);
create index if not exists notifications_unread_idx
  on public.notifications(recipient_id) where read_at is null;

-- 5. Helpers (SECURITY DEFINER) ---------------------------------------------
-- These read membership WITHOUT re-triggering RLS, which is essential: a policy
-- on conversation_participants that itself queried that table would recurse.

-- Is the current user a participant of this conversation?
create or replace function public.is_conversation_participant(conv_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.conversation_participants
    where conversation_id = conv_id and profile_id = auth.uid()
  );
$$;

-- Is the current user an admin (manager) of this conversation/group?
create or replace function public.is_conversation_admin(conv_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.conversation_participants
    where conversation_id = conv_id and profile_id = auth.uid() and is_admin
  );
$$;

-- Advance the caller's read cursor for a conversation (clears its unread count).
-- Done through a definer function so the participants UPDATE policy can stay
-- admin-only — a member can mark-as-read without being able to edit membership.
create or replace function public.mark_conversation_read(conv_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.conversation_participants
  set last_read_at = now()
  where conversation_id = conv_id and profile_id = auth.uid();
$$;

-- Per-conversation count of messages the caller has not yet read (excluding
-- their own). Returned as a small set the app can map over.
create or replace function public.unread_counts()
returns table(conversation_id uuid, unread bigint)
language sql security definer set search_path = public stable as $$
  select m.conversation_id, count(*)
  from public.messages m
  join public.conversation_participants cp
    on cp.conversation_id = m.conversation_id and cp.profile_id = auth.uid()
  where m.created_at > cp.last_read_at
    and m.sender_id <> auth.uid()
  group by m.conversation_id;
$$;

-- 6. Keep each conversation's "last message" summary current ----------------
create or replace function public.on_message_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.conversations
  set last_message_at = new.created_at,
      last_message_preview = left(new.body, 140)
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists messages_after_insert on public.messages;
create trigger messages_after_insert
  after insert on public.messages
  for each row execute function public.on_message_insert();

-- 7. Row Level Security -----------------------------------------------------
alter table public.conversations             enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages                  enable row level security;
alter table public.notifications             enable row level security;

-- Conversations: participants can read; anyone may create one they own (the
-- server action also seeds participants via the service-role client); group
-- admins can rename/delete.
drop policy if exists conversations_select on public.conversations;
create policy conversations_select on public.conversations
  for select using (public.is_conversation_participant(id));

drop policy if exists conversations_insert on public.conversations;
create policy conversations_insert on public.conversations
  for insert with check (created_by = auth.uid());

drop policy if exists conversations_update on public.conversations;
create policy conversations_update on public.conversations
  for update using (public.is_conversation_admin(id))
  with check (public.is_conversation_admin(id));

drop policy if exists conversations_delete on public.conversations;
create policy conversations_delete on public.conversations
  for delete using (public.is_conversation_admin(id));

-- Participants: co-members are visible to each other; group admins manage the
-- roster; a member may always remove THEMSELVES (leave). Read-cursor updates go
-- through mark_conversation_read(), so UPDATE here stays admin-only.
drop policy if exists conv_participants_select on public.conversation_participants;
create policy conv_participants_select on public.conversation_participants
  for select using (public.is_conversation_participant(conversation_id));

drop policy if exists conv_participants_insert on public.conversation_participants;
create policy conv_participants_insert on public.conversation_participants
  for insert with check (public.is_conversation_admin(conversation_id));

drop policy if exists conv_participants_update on public.conversation_participants;
create policy conv_participants_update on public.conversation_participants
  for update using (public.is_conversation_admin(conversation_id))
  with check (public.is_conversation_admin(conversation_id));

drop policy if exists conv_participants_delete on public.conversation_participants;
create policy conv_participants_delete on public.conversation_participants
  for delete using (
    public.is_conversation_admin(conversation_id) or profile_id = auth.uid()
  );

-- Messages: participants read; you may only send as yourself into a
-- conversation you belong to; you can edit/delete your own (group admins may
-- also delete to moderate).
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select using (public.is_conversation_participant(conversation_id));

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert with check (
    sender_id = auth.uid() and public.is_conversation_participant(conversation_id)
  );

drop policy if exists messages_update on public.messages;
create policy messages_update on public.messages
  for update using (sender_id = auth.uid()) with check (sender_id = auth.uid());

drop policy if exists messages_delete on public.messages;
create policy messages_delete on public.messages
  for delete using (
    sender_id = auth.uid() or public.is_conversation_admin(conversation_id)
  );

-- Notifications: you only ever see and manage your own. No INSERT policy on
-- purpose — only trusted server-side code (service-role) creates them.
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select using (recipient_id = auth.uid());

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications
  for update using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

drop policy if exists notifications_delete on public.notifications;
create policy notifications_delete on public.notifications
  for delete using (recipient_id = auth.uid());

-- 8. Realtime ---------------------------------------------------------------
-- Add the live tables to Supabase's realtime publication (guarded so re-running
-- the migration does not error). RLS still applies to the realtime stream, so a
-- client only receives rows it is allowed to read.
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

-- 9. Broaden profile reads for the team directory ---------------------------
-- Chat needs every signed-in user to resolve their colleagues' names (to start
-- a DM, build a group, and label messages). We therefore open SELECT on
-- profiles to any authenticated user. This is a basic internal directory —
-- writes (insert/update/delete) remain restricted to admins + HR & Management
-- by the policies from migration 0002.
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select using (auth.uid() is not null);

-- ===========================================================================
-- Done. Chat and notifications are now live. Nothing else to configure —
-- realtime is enabled above, and notifications are produced by the app's
-- server actions (sending a DM/mention, posting an invoice, joining a group).
-- ===========================================================================
