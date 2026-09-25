-- Apply after 0025. Test in staging first. No existing messages are removed.
begin;
alter table public.messages
  add column if not exists reply_to_id uuid references public.messages(id) on delete set null,
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists client_request_id uuid;
create unique index if not exists messages_sender_request_key on public.messages(sender_id, client_request_id) where client_request_id is not null;
create index if not exists messages_thread_cursor on public.messages(conversation_id, created_at desc, id desc);

create table if not exists public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (emoji in ('👍','❤️','🎉','👀','✅','🙏')),
  created_at timestamptz not null default now(),
  primary key(message_id, profile_id, emoji)
);
create table if not exists public.conversation_pins (
  message_id uuid primary key references public.messages(id) on delete cascade,
  pinned_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
alter table public.message_reactions enable row level security;
alter table public.conversation_pins enable row level security;
grant select, insert, delete on public.message_reactions, public.conversation_pins to authenticated;
revoke update on public.message_reactions, public.conversation_pins from authenticated, anon;
create policy reactions_read on public.message_reactions for select to authenticated using (
  exists(select 1 from public.messages m where m.id = message_id)
);
create policy reactions_insert on public.message_reactions for insert to authenticated with check (
  profile_id = auth.uid() and exists(select 1 from public.messages m where m.id = message_id and m.deleted_at is null)
);
create policy reactions_delete on public.message_reactions for delete to authenticated using (
  profile_id = auth.uid() and exists(select 1 from public.messages m where m.id = message_id)
);
create policy pins_read on public.conversation_pins for select to authenticated using (
  exists(select 1 from public.messages m where m.id = message_id)
);
create policy pins_insert on public.conversation_pins for insert to authenticated with check (
  pinned_by = auth.uid() and exists(select 1 from public.messages m where m.id = message_id and m.deleted_at is null)
);
create policy pins_delete on public.conversation_pins for delete to authenticated using (
  exists(select 1 from public.messages m where m.id = message_id
    and (pinned_by = auth.uid() or public.is_conversation_admin(m.conversation_id)))
);

-- Only the narrow RPCs below can edit or soft-delete. Revoke grants as well as
-- replacing old policies so a crafted REST request cannot change identity/time.
drop policy if exists messages_update on public.messages;
drop policy if exists messages_delete on public.messages;
revoke update, delete on public.messages from public, anon, authenticated;

create or replace function public.guard_chat_insert()
returns trigger language plpgsql set search_path = public as $$
begin
  new.created_at := clock_timestamp();
  new.edited_at := null;
  new.deleted_at := null;
  if length(btrim(new.body)) > 4000 or (length(btrim(new.body)) = 0 and jsonb_array_length(new.attachments) = 0) then
    raise exception 'Message must have text or attachments (up to 4000 characters)';
  end if;
  if new.reply_to_id is not null and not exists(
    select 1 from public.messages m where m.id = new.reply_to_id
      and m.conversation_id = new.conversation_id and m.deleted_at is null
  ) then raise exception 'Reply target is unavailable'; end if;
  return new;
end;
$$;
create trigger chat_insert_guard before insert on public.messages for each row execute function public.guard_chat_insert();

create or replace function public.edit_chat_message(message_id uuid, body text)
returns public.messages language plpgsql security definer set search_path = public as $$
declare target public.messages;
begin
  select * into target from public.messages m where m.id = message_id for update;
  if auth.uid() is null or target.id is null or target.sender_id <> auth.uid()
    or not public.is_conversation_participant(target.conversation_id) then raise exception 'Message unavailable'; end if;
  if target.deleted_at is not null or clock_timestamp() > target.created_at + interval '15 minutes' then raise exception 'The 15-minute edit window has ended'; end if;
  if body is null or length(btrim(body)) > 4000 or (length(btrim(body)) = 0 and jsonb_array_length(target.attachments) = 0) then raise exception 'Invalid message text'; end if;
  update public.messages m set body = btrim(edit_chat_message.body), edited_at = clock_timestamp()
    where m.id = message_id returning * into target;
  return target;
end;
$$;
create or replace function public.delete_chat_message(message_id uuid)
returns public.messages language plpgsql security definer set search_path = public as $$
declare target public.messages;
begin
  select * into target from public.messages m where m.id = message_id for update;
  if auth.uid() is null or target.id is null or target.sender_id <> auth.uid()
    or not public.is_conversation_participant(target.conversation_id) then raise exception 'Message unavailable'; end if;
  if target.deleted_at is not null then return target; end if;
  if clock_timestamp() > target.created_at + interval '15 minutes' then raise exception 'The 15-minute delete window has ended'; end if;
  update public.messages m set body = '', mentions = '{}', attachments = '[]', deleted_at = clock_timestamp()
    where m.id = message_id returning * into target;
  delete from public.message_reactions r where r.message_id = target.id;
  delete from public.conversation_pins p where p.message_id = target.id;
  return target;
end;
$$;

create or replace function public.refresh_edited_chat_preview()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.id = (select m.id from public.messages m where m.conversation_id = new.conversation_id order by m.created_at desc, m.id desc limit 1) then
    update public.conversations set last_message_preview = case
      when new.deleted_at is not null then 'Message deleted'
      when length(new.body) > 0 then left(new.body,140)
      else '📎 Attachment' end
    where id = new.conversation_id;
  end if;
  return new;
end;
$$;
create trigger chat_update_preview after update on public.messages for each row execute function public.refresh_edited_chat_preview();

create or replace function public.mark_chat_read_through(conv_id uuid, message_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare stamp timestamptz;
begin
  if auth.uid() is null or not public.is_conversation_participant(conv_id) then raise exception 'Conversation unavailable'; end if;
  select created_at into stamp from public.messages m where m.id = message_id and m.conversation_id = conv_id;
  if stamp is null then raise exception 'Message unavailable'; end if;
  update public.conversation_participants set last_read_at = greatest(last_read_at,stamp)
    where conversation_id = conv_id and profile_id = auth.uid();
end;
$$;
create or replace function public.unread_counts()
returns table(conversation_id uuid, unread bigint)
language sql security definer set search_path = public stable as $$
  select m.conversation_id, count(*) from public.messages m
  join public.conversation_participants cp on cp.conversation_id = m.conversation_id and cp.profile_id = auth.uid()
  where m.created_at > cp.last_read_at and m.sender_id <> auth.uid() and m.deleted_at is null group by m.conversation_id;
$$;
create or replace function public.chat_capabilities()
returns integer language sql stable set search_path = public as $$ select 1; $$;

revoke all on function public.edit_chat_message(uuid,text), public.delete_chat_message(uuid), public.mark_chat_read_through(uuid,uuid), public.chat_capabilities() from public, anon;
grant execute on function public.edit_chat_message(uuid,text), public.delete_chat_message(uuid), public.mark_chat_read_through(uuid,uuid), public.chat_capabilities() to authenticated;

do $$ declare tbl text;
begin
  foreach tbl in array array['messages','message_reactions','conversation_pins','conversation_participants','conversations','profiles'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = tbl) then
      execute format('alter publication supabase_realtime add table public.%I',tbl);
    end if;
  end loop;
end $$;
commit;
