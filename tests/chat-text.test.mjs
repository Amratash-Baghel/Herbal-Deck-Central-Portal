import test from 'node:test';
import assert from 'node:assert/strict';
import {messageTextParts} from '../components/chat/chat-model.ts';
test('mentions only highlight confirmed recipients and URLs retain their target',()=>{
  assert.deepEqual(messageTextParts('Hi @Neha Rao https://example.com/a @Unknown',['Neha Rao']),[
    {text:'Hi ',kind:'text'},{text:'@Neha Rao',kind:'mention'},{text:' ',kind:'text'},
    {text:'https://example.com/a',kind:'link'},{text:' @Unknown',kind:'text'}
  ]);
});
test('regex characters in names and unsafe schemes stay literal',()=>{
  assert.deepEqual(messageTextParts('@A (QA) javascript:alert(1)',['A (QA)']),[
    {text:'@A (QA)',kind:'mention'},{text:' javascript:alert(1)',kind:'text'}
  ]);
});
