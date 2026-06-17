// Unit tests for the public-location privacy lib. node --test src/lib/location.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicPosition } from './location.ts';

const pos = { lat: 47.60621, lng: -122.33207, when: 'now', live: true };

test('precise returns the exact point', () => {
  assert.deepEqual(publicPosition(pos, 'precise'), pos);
});

test('off returns null (no public dot)', () => {
  assert.equal(publicPosition(pos, 'off'), null);
});

test('approximate rounds to 1 decimal (~city level) and keeps metadata', () => {
  const p = publicPosition(pos, 'approximate');
  assert.equal(p.lat, 47.6);
  assert.equal(p.lng, -122.3);
  assert.equal(p.when, 'now');
  assert.equal(p.live, true);
});

test('unknown/unset sharing defaults to approximate (never leaks precise)', () => {
  assert.deepEqual(publicPosition(pos, undefined), publicPosition(pos, 'approximate'));
  assert.deepEqual(publicPosition(pos, 'bogus'), publicPosition(pos, 'approximate'));
});

test('null/undefined position stays null', () => {
  assert.equal(publicPosition(null, 'precise'), null);
  assert.equal(publicPosition(undefined, 'approximate'), null);
});
