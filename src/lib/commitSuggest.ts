// Smart Commit — the pure scoring heart. Given a climb, the trip's chapters, the
// committed stops, and (optional) precomputed weather hints, propose the best open
// days to send it. No I/O and only type imports (fully erased at runtime), so it runs
// standalone under `node --test`. The endpoint derives the weather hints from
// weather.ts and feeds them in — keeping send-day logic single-sourced.
//
// See docs/superpowers/specs/2026-06-15-smart-commit-design.md.
import type { Chapter, Stop, DayType } from './types';

/** Per-date weather verdicts, precomputed by the caller from the objective's forecast. */
export interface WeatherHints {
  windowDates?: Set<string>; // ISO days inside the forecast's send window
  sendDates?: Set<string>;   // ISO days that are individually send-able
  badDates?: Set<string>;    // ISO days with clearly poor weather
}

export interface SuggestObjective {
  name: string;
  region?: string | null;
  day_type?: 'crag' | 'alpine' | null;
}

export interface SuggestInput {
  objective: SuggestObjective;
  chapters: Chapter[];
  stops: Stop[];
  today: string;             // YYYY-MM-DD — injected for determinism/testability
  weather?: WeatherHints;
}

export interface Suggestion {
  date: string;              // YYYY-MM-DD
  chapterId: string;
  chapterName: string;
  chapterEmoji: string;
  dayType: DayType;
  reasons: string[];
  rough: boolean;            // true = trip-wide fallback (no confident chapter match)
}

export interface SuggestResult {
  suggestions: Suggestion[];
  fallbackManual: boolean;
}

const isoLocal = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Generic tokens we don't want driving a region→chapter match.
const STOPWORDS = new Set([
  'the', 'of', 'and', 'to', 'peak', 'mount', 'ridge', 'traverse', 'range', 'north',
  'south', 'east', 'west', 'spire', 'tower', 'towers', 'buttress', 'route', 'rock',
  'rocks', 'creek', 'lake', 'direct', 'open', 'book', 'crack', 'cracks',
]);

const tokenize = (s?: string | null): string[] =>
  (s ?? '').toLowerCase().split(/[^a-z]+/).filter((t) => t.length >= 4 && !STOPWORDS.has(t));

/** Loose token overlap between the objective (region + name) and a chapter name. */
function matchScore(obj: SuggestObjective, chapterName: string): number {
  const hay = new Set([...tokenize(obj.region), ...tokenize(obj.name)]);
  let score = 0;
  for (const t of tokenize(chapterName)) {
    for (const h of hay) {
      if (t === h || t.includes(h) || h.includes(t)) { score++; break; }
    }
  }
  return score;
}

const isUntitled = (c: Chapter): boolean => /untitled/i.test(c.name);

/** The effective ISO day a stop occupies — structured date first, then free-text. */
function stopDay(s: Stop, year: number): string | null {
  if (s.start_date) return s.start_date.slice(0, 10);
  if (s.date) { const d = new Date(`${s.date} ${year}`); return isNaN(d.getTime()) ? null : isoLocal(d); }
  return null;
}

/** ISO days in [start, end] inclusive (guarded to a sane span). */
function daysInRange(start: string, end: string): string[] {
  const out: string[] = [];
  const e = new Date(`${end}T12:00:00`);
  let d = new Date(`${start}T12:00:00`);
  for (let guard = 0; d <= e && guard < 60; guard++) {
    out.push(isoLocal(d));
    d = new Date(d); d.setDate(d.getDate() + 1);
  }
  return out;
}

/** An open-ended chapter (no end_date) is capped to a ~2-week span for candidate days. */
function chapterEnd(c: Chapter): string {
  if (c.end_date) return c.end_date.slice(0, 10);
  const d = new Date(`${c.start_date}T12:00:00`); d.setDate(d.getDate() + 13);
  return isoLocal(d);
}

const isWeekend = (key: string): boolean => {
  const g = new Date(`${key}T12:00:00`).getDay();
  return g === 0 || g === 6;
};

/**
 * Propose the best open days to commit `objective` to.
 * Hybrid: prefer a confident region→chapter match; else fall back trip-wide (flagged
 * `rough`). Ranks open days by weather window, the alpine/crag rhythm, then soonness.
 */
export function suggestDays(input: SuggestInput, limit = 3): SuggestResult {
  const { objective, chapters, stops, today, weather = {} } = input;
  const year = Number(today.slice(0, 4)) || new Date().getFullYear();
  const dayType: DayType = objective.day_type ?? 'alpine';

  // Days already spoken for.
  const occupied = new Set<string>();
  for (const s of stops) {
    if ((s.status ?? 'confirmed') === 'declined') continue;
    const k = stopDay(s, year);
    if (k) occupied.add(k);
  }

  const dated = chapters.filter((c) => c.start_date);

  // Hybrid anchor: the best-matching named, dated chapter (score > 0), else trip-wide.
  let anchor: Chapter | null = null;
  let best = 0;
  for (const c of dated) {
    if (isUntitled(c)) continue;
    const sc = matchScore(objective, c.name);
    if (sc > best) { best = sc; anchor = c; }
  }
  const rough = !anchor;
  const pool = anchor ? [anchor] : dated;

  // Open, non-past candidate days within the pool.
  const cands: { date: string; chapter: Chapter }[] = [];
  for (const c of pool) {
    if (!c.start_date) continue;
    for (const k of daysInRange(c.start_date.slice(0, 10), chapterEnd(c))) {
      if (k < today || occupied.has(k)) continue;
      cands.push({ date: k, chapter: c });
    }
  }

  const scored = cands.map(({ date, chapter }) => {
    const reasons: string[] = ['open'];
    let score = 1;
    if (weather.windowDates?.has(date)) { score += 3; reasons.push('send window'); }
    else if (weather.sendDates?.has(date)) { score += 2; reasons.push('good weather'); }
    else if (weather.badDates?.has(date)) { score -= 2; reasons.push('iffy weather'); }
    const wknd = isWeekend(date);
    if (dayType === 'alpine' && wknd) { score += 2; reasons.push('weekend'); }
    else if (dayType === 'crag' && !wknd) { score += 1; reasons.push('weekday'); }
    if (rough) reasons.push('rough — confirm');
    return { date, chapter, reasons, score };
  });

  // Highest score first; ties broken by the soonest date.
  scored.sort((a, b) => (b.score - a.score) || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const suggestions: Suggestion[] = scored.slice(0, limit).map((s) => ({
    date: s.date,
    chapterId: s.chapter.id,
    chapterName: s.chapter.name,
    chapterEmoji: s.chapter.emoji ?? '📍',
    dayType,
    reasons: s.reasons,
    rough,
  }));

  return { suggestions, fallbackManual: suggestions.length === 0 };
}
