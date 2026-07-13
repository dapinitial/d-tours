import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localHourInTz, localDayInTz, isValidTz } from './notify-schedule.ts';

// 2026-07-12 09:30 UTC. Central in July = CDT (UTC-5) → 04:30; Pacific (UTC-7) → 02:30.
const at = new Date('2026-07-12T09:30:00Z');

test('localHourInTz respects the zone (DST-aware)', () => {
  assert.equal(localHourInTz('America/Chicago', at), 4);
  assert.equal(localHourInTz('America/Los_Angeles', at), 2);
  assert.equal(localHourInTz('UTC', at), 9);
});

test('localDayInTz can roll to the previous day west of UTC', () => {
  const midnightUTC = new Date('2026-07-12T03:00:00Z'); // still 2026-07-11 in the Americas
  assert.equal(localDayInTz('America/Chicago', midnightUTC), '2026-07-11');
  assert.equal(localDayInTz('UTC', midnightUTC), '2026-07-12');
});

test('isValidTz accepts IANA zones, rejects junk', () => {
  assert.equal(isValidTz('America/Denver'), true);
  assert.equal(isValidTz('Pacific/Honolulu'), true);
  assert.equal(isValidTz('Not/AZone'), false);
  assert.equal(isValidTz(''), false);
});

test('bad tz falls back rather than throwing', () => {
  assert.equal(localHourInTz('Not/AZone', at), at.getUTCHours());
  assert.equal(localDayInTz('Not/AZone', at), at.toISOString().slice(0, 10));
});
