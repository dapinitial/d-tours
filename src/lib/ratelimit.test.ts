// Unit tests for the rate-limit lib. node --test src/lib/ratelimit.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rateLimit, dailyCap, clientIp, _reset } from './ratelimit.ts';

test('allows a burst up to capacity then denies', () => {
  _reset();
  const t = 1_000_000;
  for (let i = 0; i < 5; i++) assert.equal(rateLimit('k', { capacity: 5, refillPerSec: 1, now: t }).ok, true, `hit ${i}`);
  const denied = rateLimit('k', { capacity: 5, refillPerSec: 1, now: t });
  assert.equal(denied.ok, false);
  assert.ok(denied.retryAfter >= 1);
});

test('refills over time', () => {
  _reset();
  const t = 2_000_000;
  for (let i = 0; i < 5; i++) rateLimit('r', { capacity: 5, refillPerSec: 1, now: t });
  assert.equal(rateLimit('r', { capacity: 5, refillPerSec: 1, now: t }).ok, false);
  // 3s later → 3 tokens back
  assert.equal(rateLimit('r', { capacity: 5, refillPerSec: 1, now: t + 3000 }).ok, true);
});

test('keys are independent', () => {
  _reset();
  const t = 3_000_000;
  assert.equal(rateLimit('a', { capacity: 1, now: t }).ok, true);
  assert.equal(rateLimit('a', { capacity: 1, now: t }).ok, false);
  assert.equal(rateLimit('b', { capacity: 1, now: t }).ok, true); // different key unaffected
});

test('dailyCap counts up to max then blocks, resets next day', () => {
  _reset();
  const day = 100 * 86_400_000;
  for (let i = 1; i <= 3; i++) assert.equal(dailyCap('chat', 3, day).ok, true);
  assert.equal(dailyCap('chat', 3, day).ok, false);
  assert.equal(dailyCap('chat', 3, day + 86_400_000).ok, true); // next UTC day resets
});

test('clientIp prefers x-forwarded-for', () => {
  const r = new Request('http://x', { headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' } });
  assert.equal(clientIp(r), '1.2.3.4');
  assert.equal(clientIp(new Request('http://x')), 'unknown');
});
