# Chat redesign release

The authenticated chat and the development-only sample are separate. Sample messages never enter Supabase.

## Deployment

1. Existing avatar setup (migration 0013) and chat attachments (0021) must already be applied.
2. Run `npm test` (includes the real migration in isolated PostgreSQL via PGlite). Apply 0026_chat_message_actions.sql in a staging Supabase project and verify its REST/Realtime integration before production.
3. Apply the reviewed migration to production, then deploy this branch. The redesigned chat also supports the old schema: core messaging works, while advanced actions stay hidden until the capability RPC succeeds.
4. Keep SUPABASE_SERVICE_ROLE_KEY server-only for the existing conversation-creation and notification actions. Never expose it with a NEXT_PUBLIC prefix.
5. Verify using two test accounts: send and receive, mention, attachment upload, edits/deletion, reactions, pins, member removal, reconnect, and profile-picture replacement.

## Rollback

Restore the previous UI commit without dropping added tables or columns. Migration 0026 intentionally removes unrestricted direct message updates/hard deletes; old ordinary message inserts remain compatible.

## Verification record

Local PostgreSQL tests cover outsider access, reaction identity, pin ownership, cross-conversation replies, forged timestamps, direct update/delete denial, 15-minute boundaries, removed members, soft-delete cleanup and request-ID uniqueness. These do not replace two-account Supabase REST/Realtime tests.

The authenticated UI was checked against existing conversations without sending employee messages or changing profile photos. Profile upload bytes/type/size validation, grouping, deduplication, mention rendering and SSR date stability have automated tests.

The existing Supabase project has not received migration 0026. Advanced controls remain hidden until the capability RPC is available. Profile photos and ordinary messaging use existing schema. Typing/presence are intentionally omitted rather than impersonating activity. Search returns the latest 50 matching messages; pins show the latest 100. Group badges use stable identity icons; shared badge customization is not enabled.

The local environment lacks a service-role key; existing DM/group creation and notification delivery need that server-only deployment setting. Photo-save and two-account mutation smoke tests must be completed in staging.

The existing dependency audit reports critical advisories in Next.js and jsPDF plus other inherited dependency advisories. This chat release does not upgrade unrelated framework/PDF dependencies; schedule a separate security update before public deployment.
