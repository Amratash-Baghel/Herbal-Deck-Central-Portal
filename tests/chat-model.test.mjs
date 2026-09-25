import assert from "node:assert/strict";
import test from "node:test";
import { canGroup, mergeMessages, isNearBottom, insertAt } from "../components/chat/chat-model.ts";

const a = { id: "a", sender_id: "one", conversation_id: "room", created_at: "2026-09-24T12:00:00Z", body: "first" };
test("groups only same sender and conversation within five minutes", () => {
  assert.equal(canGroup(a, { ...a, id: "b", created_at: "2026-09-24T12:05:00Z" }), true);
  assert.equal(canGroup(a, { ...a, created_at: "2026-09-24T12:05:00.001Z" }), false);
  assert.equal(canGroup(a, { ...a, sender_id: "two" }), false);
  assert.equal(canGroup(a, { ...a, conversation_id: "different" }), false);
  assert.equal(canGroup(undefined, a), false);
});
test("never groups across local midnight", () => {
  const before = new Date(2026, 8, 24, 23, 59).toISOString();
  const after = new Date(2026, 8, 25, 0, 1).toISOString();
  assert.equal(canGroup({ ...a, created_at: before }, { ...a, created_at: after }), false);
});
test("merge replaces edits and deduplicates acknowledgements deterministically", () => {
  const result = mergeMessages([a], [{ ...a, body: "edited" }, { ...a, id: "b" }]);
  assert.equal(result.length, 2);
  assert.equal(result[0].body, "edited");
  assert.deepEqual(result.map(m => m.id), ["a", "b"]);
  assert.equal(a.body, "first");
});
test("scroll follows latest only inside the 96 pixel boundary", () => {
  assert.equal(isNearBottom(0, 400, 800), false);
  assert.equal(isNearBottom(304, 400, 800), true);
  assert.equal(isNearBottom(303, 400, 800), false);
});
test("inserts emoji at the caret, over a selection and past the text end", () => {
  assert.equal(insertAt("hi there", 2, 2, "🎉"), "hi🎉 there");
  assert.equal(insertAt("hi there", 0, 2, "👋"), "👋 there");
  assert.equal(insertAt("", 0, 0, "✅"), "✅");
  assert.equal(insertAt("hi", 99, 99, "🌿"), "hi🌿");
  assert.equal(insertAt("hi", 2, 0, "🌿"), "hi🌿");
});
