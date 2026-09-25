import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAvatar } from '../lib/avatar-validation.ts';

test('accepts supported image signatures and derives extension from bytes', async () => {
  const png = new File([new Uint8Array([137,80,78,71,13,10,26,10])], 'photo.exe', {type:'image/png'});
  assert.deepEqual(await validateAvatar(png), {ok:true, mime:'image/png', ext:'png'});
});
test('rejects empty, oversized and disguised active content', async () => {
  for (const file of [new File([], 'a.png', {type:'image/png'}), new File(['<svg onload="alert(1)"/>'], 'a.png', {type:'image/png'}), new File([new Uint8Array(5*1024*1024+1)], 'a.jpg', {type:'image/jpeg'})]) {
    assert.equal((await validateAvatar(file)).ok, false);
  }
});
test('rejects an image whose declared type does not match its bytes', async () => {
  assert.equal((await validateAvatar(new File([new Uint8Array([255,216,255])], 'a.png', {type:'image/png'}))).ok,false);
});
