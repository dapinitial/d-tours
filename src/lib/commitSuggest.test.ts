// Unit tests for the pure Smart Commit scoring lib. Runs with zero deps under Node's
// native test runner + TS stripping:  node --test src/lib/commitSuggest.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestDays, type SuggestInput } from './commitSuggest.ts';

const chapters = [
  { id: 'dch-kickoff', name: 'Kickoff', emoji: '🚐', start_date: '2026-07-04', end_date: '2026-07-07', sort: 1 },
  { id: 'dch-winds', name: 'The Winds', emoji: '🏔️', start_date: '2026-07-08', end_date: '2026-07-15', sort: 2 },
  { id: 'dch-03', name: 'Jul 15–18 (untitled)', emoji: '📍', start_date: '2026-07-15', end_date: '2026-07-18', sort: 3 },
  { id: 'dch-spokane', name: 'Spokane', emoji: '🏙️', start_date: '2026-07-29', end_date: '2026-07-31', sort: 8 },
] as any;

const pingora = { name: 'Pingora — South Buttress / K Cracks', region: 'Wind River Range', day_type: 'alpine' as const };

const base: SuggestInput = { objective: pingora, chapters, stops: [], today: '2026-06-15' };
const isWeekend = (d: string) => { const g = new Date(`${d}T12:00:00`).getDay(); return g === 0 || g === 6; };

test('region match anchors to The Winds (not rough)', () => {
  const { suggestions } = suggestDays(base);
  assert.ok(suggestions.length > 0 && suggestions.length <= 3);
  assert.ok(suggestions.every((s) => s.chapterName === 'The Winds'));
  assert.ok(suggestions.every((s) => s.rough === false));
  assert.ok(suggestions.every((s) => s.reasons.includes('open')));
});

test('alpine rhythm puts a weekend on top', () => {
  const { suggestions } = suggestDays(base);
  assert.ok(isWeekend(suggestions[0].date), `${suggestions[0].date} should be a weekend`);
  assert.ok(suggestions[0].reasons.includes('weekend'));
});

test('a send-window day wins and is flagged', () => {
  const weather = { windowDates: new Set(['2026-07-13']) }; // a Monday in The Winds
  const { suggestions } = suggestDays({ ...base, weather });
  assert.equal(suggestions[0].date, '2026-07-13');
  assert.ok(suggestions[0].reasons.includes('send window'));
});

test('occupied days are excluded (open days only)', () => {
  const stops = [{ id: 's1', order: 1, name: 'x', flex: 'soft', start_date: '2026-07-11' }] as any;
  const { suggestions } = suggestDays({ ...base, stops });
  assert.ok(!suggestions.some((s) => s.date === '2026-07-11'));
});

test('no confident match → rough, trip-wide', () => {
  const { suggestions } = suggestDays({ ...base, objective: { name: 'Atlantis Spire', region: 'Narnia', day_type: 'alpine' } });
  assert.ok(suggestions.length > 0);
  assert.ok(suggestions.every((s) => s.rough === true));
  assert.ok(suggestions.every((s) => s.reasons.includes('rough — confirm')));
});

test('crag rhythm prefers a weekday', () => {
  const crag = { name: 'Pingora', region: 'Wind River Range', day_type: 'crag' as const };
  const { suggestions } = suggestDays({ ...base, objective: crag });
  assert.ok(!isWeekend(suggestions[0].date), `${suggestions[0].date} should be a weekday`);
  assert.ok(suggestions[0].reasons.includes('weekday'));
});

test('no dated chapters → manual fallback', () => {
  const { suggestions, fallbackManual } = suggestDays({ ...base, chapters: [] });
  assert.equal(suggestions.length, 0);
  assert.equal(fallbackManual, true);
});
