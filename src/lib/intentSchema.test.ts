// Unit tests for the pure schema-response parser. node --test src/lib/intentSchema.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSchemaResponse } from './intentSchema.ts';

const good = '{"sections":[{"key":"dives","label":"Dive Sites","icon":"🤿","fields":["sites","depth"]},{"key":"gear","label":"Gear","icon":"🎒","fields":["essentials"]}]}';

test('parses a clean JSON schema', () => {
  const s = parseSchemaResponse(good);
  assert.ok(s);
  assert.equal(s.sections[0].label, 'Dive Sites');
});

test('extracts JSON even with surrounding prose / fences', () => {
  const wrapped = 'Here is your schema:\n```json\n' + good + '\n```\nEnjoy!';
  const s = parseSchemaResponse(wrapped);
  assert.ok(s);
  assert.equal(s.sections.length, 2);
});

test('returns null for invalid / empty / malformed', () => {
  assert.equal(parseSchemaResponse(''), null);
  assert.equal(parseSchemaResponse(null), null);
  assert.equal(parseSchemaResponse('no json here'), null);
  assert.equal(parseSchemaResponse('{not valid json'), null);
  assert.equal(parseSchemaResponse('{"sections":[]}'), null); // valid JSON, invalid schema
});
