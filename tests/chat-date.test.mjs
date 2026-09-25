import test from 'node:test';
import assert from 'node:assert/strict';
import {formatConversationDate} from '../components/chat/chat-model.ts';
import {execFileSync} from 'node:child_process';
test('conversation date is deterministic across SSR and browser timezone/locale',()=>{
  assert.equal(formatConversationDate('2026-09-18T23:30:00Z'),'19 Sept');
  const moduleUrl=new URL('../components/chat/chat-model.ts',import.meta.url).href;
  const value=execFileSync(process.execPath,['--input-type=module','-e',`import {formatConversationDate} from '${moduleUrl}'; process.stdout.write(formatConversationDate('2026-09-18T23:30:00Z'));`],{env:{...process.env,TZ:'UTC',LANG:'en_US.UTF-8'},encoding:'utf8'});
  assert.equal(value,'19 Sept');
});
