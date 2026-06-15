// Unit tests for the pure section-schema lib. node --test src/lib/sectionSchema.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidSchema, resolveSchema, isClimbingTrip,
  DEFAULT_SCHEMA, CLIMBING_SCHEMA, ROADTRIP_SCHEMA, WORLDCUP_SCHEMA,
} from './sectionSchema.ts';

test('presets are all valid schemas', () => {
  for (const s of [DEFAULT_SCHEMA, CLIMBING_SCHEMA, ROADTRIP_SCHEMA, WORLDCUP_SCHEMA]) {
    assert.ok(isValidSchema(s));
  }
});

test('roadtrip has a Packing List, climbing has Skills — the core swap', () => {
  assert.ok(ROADTRIP_SCHEMA.sections.some((s) => /packing/i.test(s.label)));
  assert.ok(CLIMBING_SCHEMA.sections.some((s) => /skills/i.test(s.label)));
  assert.ok(!ROADTRIP_SCHEMA.sections.some((s) => /skills/i.test(s.label)));
});

test('isValidSchema rejects malformed input', () => {
  assert.equal(isValidSchema(null), false);
  assert.equal(isValidSchema({}), false);
  assert.equal(isValidSchema({ sections: [] }), false);
  assert.equal(isValidSchema({ sections: [{ key: 'x' }] }), false);
  assert.equal(isValidSchema({ sections: [{ key: 'x', label: 'X', icon: '📍', fields: [] }] }), true);
});

test('resolveSchema falls back to DEFAULT for missing/bad schema', () => {
  assert.deepEqual(resolveSchema(null), DEFAULT_SCHEMA);
  assert.deepEqual(resolveSchema({}), DEFAULT_SCHEMA);
  assert.deepEqual(resolveSchema({ section_schema: { sections: 'nope' } }), DEFAULT_SCHEMA);
});

test('resolveSchema returns a tenant schema when valid', () => {
  assert.deepEqual(resolveSchema({ section_schema: CLIMBING_SCHEMA }), CLIMBING_SCHEMA);
});

test('isClimbingTrip keys on interests', () => {
  assert.equal(isClimbingTrip({ interests: ['climbing'] }), true);
  assert.equal(isClimbingTrip({ interests: ['road-trip'] }), false);
  assert.equal(isClimbingTrip({}), false);
  assert.equal(isClimbingTrip(null), false);
});
