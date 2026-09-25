import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const A='00000000-0000-4000-8000-000000000001', B='00000000-0000-4000-8000-000000000002', C='00000000-0000-4000-8000-000000000003';
const X='10000000-0000-4000-8000-000000000001', Y='10000000-0000-4000-8000-000000000002';
const request='30000000-0000-4000-8000-000000000001';
test('database permissions, time windows, tombstones and idempotency',async t=>{
  const db=new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,public to authenticated;
    create table public.profiles(id uuid primary key);
    alter table public.profiles enable row level security;
    create publication supabase_realtime;
    insert into public.profiles values ('${A}'),('${B}'),('${C}');
  `);
  await db.exec(await readFile(new URL('../supabase/migrations/0005_chat_and_notifications.sql',import.meta.url),'utf8'));
  await db.exec(`
    alter table public.messages add column attachments jsonb not null default '[]';
    grant select,insert,update,delete on all tables in schema public to authenticated;
    insert into public.conversations(id,type,name,created_by) values ('${X}','group','test','${A}'),('${Y}','group','other','${C}');
    insert into public.conversation_participants(conversation_id,profile_id,is_admin) values
      ('${X}','${A}',true),('${X}','${B}',false),('${Y}','${C}',true);
  `);
  await db.exec(await readFile(new URL('../supabase/migrations/0026_chat_message_actions.sql',import.meta.url),'utf8'));
  async function as(id,sql,params=[]) {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
    await db.exec('set role authenticated');
    return db.query(sql,params);
  }
  const sent=await as(A,'insert into messages(conversation_id,sender_id,body,client_request_id,created_at) values ($1,$2,$3,$4,$5) returning *',[X,A,'hello',request,'2000-01-01']);
  const m=sent.rows[0];
  await t.test('server owns timestamps and request id prevents duplicate sends',async()=>{
    assert.ok(new Date(m.created_at).getTime()>Date.now()-60000);
    await assert.rejects(()=>as(A,'insert into messages(conversation_id,sender_id,body,client_request_id) values ($1,$2,$3,$4)',[X,A,'retry',request]),/unique/i);
    assert.equal((await as(A,'select count(*)::int as n from messages')).rows[0].n,1);
  });
  await t.test('outsider cannot read or react and member cannot edit another sender',async()=>{
    assert.equal((await as(C,'select * from messages where id=$1',[m.id])).rows.length,0);
    await assert.rejects(()=>as(C,'insert into message_reactions(message_id,profile_id,emoji) values ($1,$2,$3)',[m.id,C,'👍']),/row-level/i);
    await assert.rejects(()=>as(B,'select edit_chat_message($1,$2)',[m.id,'bad']),/unavailable/i);
    await assert.rejects(()=>as(C,'select delete_chat_message($1)',[m.id]),/unavailable/i);
  });
  await t.test('direct identity edits and hard deletes are denied',async()=>{
    await assert.rejects(()=>as(A,'update messages set created_at=now() where id=$1',[m.id]),/permission denied/i);
    await assert.rejects(()=>as(A,'delete from messages where id=$1',[m.id]),/permission denied/i);
  });
  await t.test('reply to another conversation is rejected',async()=>{
    const n=(await as(C,'insert into messages(conversation_id,sender_id,body) values ($1,$2,$3) returning id',[Y,C,'private'])).rows[0];
    await assert.rejects(()=>as(A,'insert into messages(conversation_id,sender_id,body,reply_to_id) values ($1,$2,$3,$4)',[X,A,'cross',n.id]),/unavailable/i);
  });
  await t.test('own edit succeeds before 15 minutes, fails after and after removal',async()=>{
    await db.exec('reset role');
    await db.query("update messages set created_at=clock_timestamp()-interval '14 minutes 59 seconds' where id=$1",[m.id]);
    assert.equal((await as(A,'select (edit_chat_message($1,$2)).body as body',[m.id,'edited'])).rows[0].body,'edited');
    await db.exec('reset role');
    await db.query("update messages set created_at=clock_timestamp()-interval '15 minutes 1 second' where id=$1",[m.id]);
    await assert.rejects(()=>as(A,'select edit_chat_message($1,$2)',[m.id,'late']),/15-minute/i);
    await assert.rejects(()=>as(A,'select delete_chat_message($1)',[m.id]),/15-minute/i);
    await db.exec('reset role');
    await db.query('update messages set created_at=clock_timestamp() where id=$1',[m.id]);
    await db.query('delete from conversation_participants where conversation_id=$1 and profile_id=$2',[X,A]);
    await assert.rejects(()=>as(A,'select edit_chat_message($1,$2)',[m.id,'removed']),/unavailable/i);
    await db.exec('reset role');
    await db.query('insert into conversation_participants(conversation_id,profile_id,is_admin) values ($1,$2,true)',[X,A]);
  });
  await t.test('reaction identity and pin ownership enforced; soft delete clears metadata',async()=>{
    await as(B,'insert into message_reactions(message_id,profile_id,emoji) values ($1,$2,$3)',[m.id,B,'👍']);
    await assert.rejects(()=>as(A,'insert into message_reactions(message_id,profile_id,emoji) values ($1,$2,$3)',[m.id,B,'🎉']),/row-level/i);
    await as(A,'insert into conversation_pins(message_id,pinned_by) values ($1,$2)',[m.id,A]);
    assert.equal((await as(B,'delete from conversation_pins where message_id=$1 returning *',[m.id])).rows.length,0);
    const gone=(await as(A,'select (delete_chat_message($1)).*',[m.id])).rows[0];
    assert.equal(gone.body,'');assert.ok(gone.deleted_at);assert.deepEqual(gone.attachments,[]);
    assert.equal((await as(B,'select * from message_reactions where message_id=$1',[m.id])).rows.length,0);
    assert.equal((await as(B,'select * from conversation_pins where message_id=$1',[m.id])).rows.length,0);
    await assert.rejects(()=>as(B,'insert into message_reactions(message_id,profile_id,emoji) values ($1,$2,$3)',[m.id,B,'👍']),/row-level/i);
  });
  await db.close();
});
