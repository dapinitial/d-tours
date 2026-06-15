# Smart Commit — "Shotgun, when do I send this?" — Design

**Date:** 2026-06-15
**Status:** Approved (design); ready for implementation plan
**Author:** David + Shotgun
**Builds on:** `docs/superpowers/specs/2026-06-14-trip-chapters-calendar-design.md` (chapters + day-level calendar, shipped)

## Problem

The trip-chapters calendar can hold committed climbs, and the itinerary CMS can commit
one to a day. But the natural moment to decide *when* to send a climb is **while reading
its beta** on the dossier — not in a separate editor. And picking a date by hand ignores
everything we already know: where you'll be, which days are still open, the weather
window, and your weekday-work / weekend-send rhythm.

## Goal

On a climbing dossier, an **owner-only "📅 Add to a day"** button that proposes 2–3
smart dates (each with a one-line "why"), commits the chosen one in a single tap (reusing
the existing commit path), and always allows a manual override. It closes the
**beta → date → calendar** loop in one place.

## Verified building blocks (confirmed in code 2026-06-15)

- **Commit path:** `POST /api/itinerary` `action:'add'` upserts a stop and **auto-files
  `chapter_id` from `start_date`** (`fileChapter`). Persists `start_date`, `day_type`,
  `objective_id`. Owner-gated via `requireOwner` (`supabaseServer` auth + `crew.is_owner`).
- **Weather:** `src/lib/weather.ts` — `isSendDay(day)`, `sendWindow(days) → {start,len}|null`,
  `windowLabel(days, win)`. Forecast shape (on `objective.beta.conditions.forecast`):
  `{updated_at, days:[{date, code, tmax, tmin, precip, precip_prob, wind}]}`.
- **Data:** `getChapters(tid)` (dated, sorted), `getStops(tid)`, `objective.day_type`
  (`'crag'|'alpine'`), `objective.lat/lng/region`. `haversineMi(aLat,aLng,bLat,bLng)`.
- **Auth scope:** `middleware.ts` sets `locals.tenantId`/`locals.user` **only on `/cms/*`**.
  The public dossier has no owner signal — this feature adds one.
- **Data reality:** as of now **0 stops have a structured `start_date` or `chapter_id`**
  (52 total). Geographic chapter-matching is therefore data-starved; the *reliable*
  signals today are weather-window + day_type rhythm + open-days. This drives the
  **hybrid** anchor decision below.

## Design

### Architecture / data flow

- **New owner-gated endpoint** `GET /api/commit-suggestions?objective=<id>`:
  - Reuses `requireOwner`. Returns
    `{ ok, suggestions: [{date, chapterId, chapterName, chapterEmoji, dayType, reasons: string[]}], fallbackManual: boolean }`.
  - Loads the objective, `getChapters(tid)`, `getStops(tid)`, and the forecast from the
    objective's beta. Delegates ranking to the scoring lib.
- **Scoring lib** `src/lib/commitSuggest.ts` — pure, testable. Exposes
  `suggestDays({ objective, chapters, stops, forecast, today }) → Suggestion[]`.
  No I/O; takes data in, returns ranked suggestions. This is where the algorithm lives.
- **Dossier widget** (`/objectives/[id].astro`): owner-only **📅 Add to a day** button.
  On click → `fetch('/api/commit-suggestions?objective=<id>')` → render date chips. A chip's
  **Commit** (and the manual picker) → `POST /api/itinerary` `action:'add'` with
  `{ id, name, sub, emoji, region, lat, lng, flex:'soft', status:'confirmed', kind:'sidequest',
  objective_id, start_date, day_type }` (chapter auto-files server-side). Toast + a link to
  `/calendar`.

### Suggestion algorithm (`suggestDays`)

1. **Match chapter (hybrid).** Token-match `objective.region` + `objective.name` against
   *named* chapters (normalize, drop generic tokens; e.g. "Wind River" → "The Winds"). A
   confident hit = the **anchor chapter**. No confident hit → **trip-wide** over all dated
   chapters, with every suggestion flagged "rough — confirm the date."
2. **Candidate open days.** Enumerate the anchor chapter's `[start_date, end_date]` (or all
   dated chapters trip-wide); **drop any day already holding a committed stop** (a stop whose
   effective date falls on it). Open days only.
3. **Score each open day.**
   - 🌤️ **weather** — day in `sendWindow`: +strong; `isSendDay(day)`: +med; clearly bad
     (high precip/wind): −; **beyond forecast horizon: neutral 0** (most trip dates are weeks
     out, so weather is often unknown — that's fine).
   - 🗓️ **rhythm** — `day_type === 'alpine'` → weekend (Sat/Sun) bonus; `'crag'` → weekday
     bonus. (Mirrors the WFH-weekday / weekend-send rhythm.)
   - ⏱️ **soonness** — earlier within the window as a tiebreak.
   - **confidence** — region-matched chapter ranks above trip-wide.
4. **Return top 3**, each with human reasons (e.g. `["open day in The Winds", "weekend —
   good for a committing alpine route", "forecast looks like a send window"]`). `dayType`
   defaults from `objective.day_type` (falls back to `'alpine'` when absent).
5. **Fallback.** No dated chapter, or no open days → `suggestions: []`, `fallbackManual: true`.

### UI

```
[ 📅 Add to a day ]            ← owner-only, on the dossier
  ↓ opens
  🏔️ Fri Jul 11 · The Winds    open · weekend · send window    [Commit]
  🏔️ Sat Jul 12 · The Winds    open · weekend                  [Commit]
  🏔️ Thu Jul 10 · The Winds    open                            [Commit]
  ──────────────────────────────────────────────
  or pick:  [ date ▾ ]  [ type ▾ ]                              [Commit]
```

The manual date + day_type picker is always present (override, or commit when suggestions
are empty/rough). Reuses the Slice 4 client commit shape.

### Owner-gating (approved)

**Inline session check in the dossier SSR**, wrapped in `try/catch` so it can **never blank
the page** (respects the known beta-blank risk): `supabaseServer(cookies, headers)
.auth.getUser()` → `crew` `is_owner` lookup → `isOwner` boolean. The button block renders
server-side only when `isOwner`. The endpoint and the commit are independently owner-gated,
so the control is defense-in-depth, not the only gate. Public visitors never see it.

### Error handling & edge cases

- Endpoint returns `401/403` for non-owner (defense in depth; the button isn't shown anyway).
- No forecast / dates beyond horizon → weather simply omitted from reasons; never an error.
- No confident chapter match → trip-wide suggestions, flagged; still commits fine.
- No dated chapters or no open days → empty suggestions + manual picker only.
- The owner check failing (network/DNS) → caught → treated as not-owner; page still renders.
- A committed day later opening up (stop deleted) naturally reappears as a candidate.

### Testing

- Unit-test `suggestDays` (pure): region match vs trip-wide; open-day filtering; weather
  bonus when in send window; alpine→weekend vs crag→weekday; empty/fallback cases.
- Manual smoke: as owner, open a Wind River dossier → expect Winds dates; commit one →
  appears on `/calendar` in The Winds; as a logged-out visitor → no button.

## Reuse / build boundary

**Reuse:** `/api/itinerary` `add` (commit + chapter auto-file), `getChapters`/`getStops`,
`weather.ts`, `haversineMi`, the Slice 4 client commit pattern, `supabaseServer`/`requireOwner`.
**New:** `GET /api/commit-suggestions`, `src/lib/commitSuggest.ts` (scoring), the dossier
widget + inline owner check.

## Build order

1. `src/lib/commitSuggest.ts` + unit tests (pure scoring — no I/O).
2. `GET /api/commit-suggestions` endpoint (owner-gated, wires data → scoring).
3. Dossier widget + inline owner check + commit wiring.
4. Manual smoke test (owner sees it, commits, lands on calendar; visitor doesn't).

## Out of scope (separate follow-ons)

- People-amplifiers: notify caravan sign-ups when a climb is committed; "👍 keen / which
  dates work for me" soft-votes on the weighing cards. Snap on after this ships.
- Improving geographic matching once stops carry structured dates/chapters (it sharpens
  automatically as the calendar fills in; no code change required for v1).

## Open questions

None blocking. The exact weather thresholds (what counts as "clearly bad") will be tuned
against `isSendDay`'s existing definition during implementation.
