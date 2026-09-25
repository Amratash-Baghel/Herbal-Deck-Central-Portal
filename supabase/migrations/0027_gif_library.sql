-- Personal GIF library.
--
-- Each person's saved GIFs live at `<profile_id>/<uuid>.gif` in a private bucket.
-- Only the owner can list, read or delete them: the folder name must equal their
-- own auth id. There is no table — storage.list() on the folder is the library.
--
-- Sending a saved GIF copies it into `chat-attachments/<conversation_id>/…` like
-- any other attachment, so every *sent* file stays conversation-scoped and the
-- existing chat-attachment policies are untouched.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gif-library', 'gif-library', false, 3145728, array['image/gif'])
on conflict (id) do update
  set public = false,
      file_size_limit = 3145728,
      allowed_mime_types = array['image/gif'];

drop policy if exists gif_library_own_read on storage.objects;
drop policy if exists gif_library_own_insert on storage.objects;
drop policy if exists gif_library_own_delete on storage.objects;

create policy gif_library_own_read on storage.objects
  for select to authenticated
  using (bucket_id = 'gif-library' and (storage.foldername(name))[1] = (auth.uid())::text);

create policy gif_library_own_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'gif-library' and (storage.foldername(name))[1] = (auth.uid())::text);

create policy gif_library_own_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'gif-library' and (storage.foldername(name))[1] = (auth.uid())::text);

-- No update policy: a stored GIF is immutable, replace it by deleting and re-uploading.
