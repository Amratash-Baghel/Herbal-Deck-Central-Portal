-- ===========================================================================
-- Migration 0021 — Chat file attachments (direct upload for small files)
-- ===========================================================================
-- Run this ONCE in the Supabase SQL Editor, AFTER migration 0020. Additive and
-- safe on the live database.
--
-- Adds direct file sharing to chat, alongside the existing "paste a link"
-- approach (see decisions.md — hybrid model):
--   1. messages.attachments — a JSON array describing files uploaded with a
--      message (path in storage, original name, mime, size, kind).
--   2. A PRIVATE `chat-attachments` storage bucket with a hard 3 MB per-file
--      limit and a type allowlist, enforced by the storage layer itself.
--   3. RLS on the bucket's objects: a file lives under its conversation's id
--      (path = "<conversation_id>/<uuid>.<ext>"), and ONLY participants of that
--      conversation may upload or read it — the same membership rule as messages.
--   4. The last-message summary trigger now falls back to an attachment label
--      when a message is a file with no text, so the conversation list still
--      shows something useful.
--
-- Larger files (over 3 MB) are shared via a Google Drive / Dropbox link pasted
-- into the message; that is a client-side concern and needs no schema.
-- ===========================================================================

-- 1. Attachments column ------------------------------------------------------
alter table public.messages
  add column if not exists attachments jsonb not null default '[]'::jsonb;

-- 2. Private bucket, size- and type-limited at the storage layer -------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-attachments',
  'chat-attachments',
  false,
  3145728, -- 3 MB
  array[
    'image/jpeg',
    'image/png',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 3. Object RLS: participants of the conversation only -----------------------
-- The first path segment is the conversation id; is_conversation_participant()
-- (migration 0005) checks membership without recursing through RLS. Because the
-- bucket is private, even reads (signed-URL minting) are gated by this policy —
-- so a non-participant can neither upload to nor read a conversation's files.

drop policy if exists "chat_attachments_read" on storage.objects;
create policy "chat_attachments_read" on storage.objects
  for select using (
    bucket_id = 'chat-attachments'
    and public.is_conversation_participant((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "chat_attachments_insert" on storage.objects;
create policy "chat_attachments_insert" on storage.objects
  for insert with check (
    bucket_id = 'chat-attachments'
    and public.is_conversation_participant((storage.foldername(name))[1]::uuid)
  );

-- Uploader may delete their own file (e.g. removing a mistaken upload).
drop policy if exists "chat_attachments_delete" on storage.objects;
create policy "chat_attachments_delete" on storage.objects
  for delete using (
    bucket_id = 'chat-attachments'
    and owner = auth.uid()
  );

-- 4. Last-message summary handles file-only messages -------------------------
create or replace function public.on_message_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.conversations
  set last_message_at = new.created_at,
      last_message_preview = case
        when length(coalesce(new.body, '')) > 0 then left(new.body, 140)
        when jsonb_array_length(coalesce(new.attachments, '[]'::jsonb)) > 0 then '📎 Attachment'
        else ''
      end
  where id = new.conversation_id;
  return new;
end;
$$;

-- ===========================================================================
-- Done. Chat messages can now carry file attachments (≤ 3 MB, image/PDF/Office),
-- stored privately and readable only by the conversation's participants.
-- ===========================================================================
