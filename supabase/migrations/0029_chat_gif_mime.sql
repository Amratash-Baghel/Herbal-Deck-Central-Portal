-- GIFs were allowed by the app but not by the bucket.
--
-- lib/chat-attachments.ts has listed `gif` in ALLOWED_TYPES since 0021, so a
-- picked GIF passes the client check, uploads, and is refused by Storage on the
-- bucket's own mime allow-list — which 0021 wrote without 'image/gif'. The
-- composer reported it as a failed send, so it read like a chat bug.
--
-- Only the allow-list changes; the bucket stays private, 3 MB, with the same
-- participant-gated policies.

update storage.buckets
   set allowed_mime_types = array[
         'image/jpeg',
         'image/png',
         'image/gif',
         'application/pdf',
         'application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
       ]
 where id = 'chat-attachments';
