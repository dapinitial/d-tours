# Trip Chapters + Day-Level Calendar — Design

**Date:** 2026-06-14
**Status:** Approved (design); ready for implementation plan
**Author:** David + Shotgun

## Problem

The trip is a 3-month mega-loop with hard anchors (the Winds with Ryan, the Aug 1
Spokane wedding) and a long tail of options — alpine objectives, roadside sport
crags & multipitch, attractions (Meow Wolf Denver), people to see, recovery/resupply
towns. Conditions (fire, smoke, weather windows, road closures, washouts) force
**day-by-day replanning**, so the plan has to flex at day-resolution.

Three concrete pains today:

1. **No day-level calendar.** Objectives have no date; the itinerary orders by a
   manual `order`/`sort`, and stop dates are free-text (`"Aug 1"`, `"Mid-July"`).
   Nothing groups the trip into dated chapters or days.
2. **The live map is "haywire."** `LiveMap.astro` draws the *entire* `trip.route`
   polyline + all stops up front, regardless of date — the whole route (Utah, etc.)
   shows before the trip has reached it. There is no "you are here" emphasis.
3. **The options pool and the itinerary live apart.** Committing a climb to the
   route exists (suggestion box → "Add to route") but it copies the objective by
   name into a stop with no back-link, and assigns no real date.

## Goal

Model the trip as a **spine of dated, named chapters**, and make **commit** the
single action that pulls an option out of the pool onto a **specific day** — which
then drives the calendar, the itinerary archive, and the map.

## What already exists (reuse, do not rebuild)

Audited 2026-06-14:

- **Dated, drag-reorderable timeline** — `src/pages/cms/itinerary.astro` +
  `src/pages/api/itinerary.ts`. Stops have a `date` field (free-text) and a
  fractional `order`; edit-on-blur; drag-to-sort.
- **Pool with a lifecycle** — objectives move `deferred` (💤 possible-climbs queue,
  `data.ts:89` `getDeferredObjectives`) → `proposed` (📥 suggestion box,
  `getProposedObjectives`) → `confirmed` (on the route). Park-don't-delete is built.
- **A working commit primitive** — the suggestion box's **"＋ Add to route"**
  (`cms/itinerary.astro:138`) creates a `kind:'sidequest'` stop from a proposed
  objective and promotes the objective via `/api/objectives` `action:'promote'`.
- **Live map** — `src/components/LiveMap.astro` (Leaflet) renders each trip's
  `route` polyline, `stops` markers, and current `position` (inReach feed).
- **`day_type`** already exists on `Objective` (`types.ts:166`) but only as
  `'crag' | 'alpine'`.

## Gaps (the actual build)

1. Stop dates are free-text → can't drive a day grid or map date-clipping.
2. No calendar lens — nothing groups stops by day.
3. No chapters — the Winds/Wedding blocks aren't objects.
4. Map renders everything — no `date ≤ today` clip, no current-location emphasis.
5. `day_type` is climb-only and limited to crag/alpine.
6. Climb→stop link is a name-copy (no FK) — committed climbs lose their dossier
   and day-type on the timeline.

## Design

**Core principle:** stops stay the single spine. The calendar is a **new read lens**
over dated stops + chapters (like `/trip/[slug]` is a lens). The commit flow is
**extended**, not forked.

### 1. Data model

**New `chapters` table** (one row per trip chapter):

| column | type | notes |
|---|---|---|
| `id` | uuid/text | pk |
| `tenant_id` | fk | trip scope |
| `name` | text | "The Winds" |
| `emoji` | text | optional cover glyph |
| `blurb` | text | optional theme line |
| `start_date` | date | ISO |
| `end_date` | date | ISO |
| `sort` | int | display order |

Seed the 9 known chapters: Kickoff (Jul 4–7) → The Winds (Jul 8–15, w/ Ryan:
Cirque Traverse, Pingora, Wolf's Head E. Ridge) → Jul 15–18 → Jul 18–20 → Jul
20–22 → Jul 23–25 → Jul 26–28 → Spokane arrival (Jul 29–31) → Wedding (Aug 1–3) →
Onward (back half).

**Extend `stops`:**

- `start_date` / `end_date` → real ISO dates. Keep the existing free-text `date`
  as a display label; the editor gains a date picker that writes both.
- `chapter_id` → FK, auto-assigned by which chapter's date range contains the stop.
- `objective_id` → **nullable FK**, set when a stop was committed from a climb.
  Replaces today's lossy name-copy so the calendar entry deep-links to the dossier
  and carries its beta/day-type. *(Decision 🔸 — approved.)*
- `day_type` → **moves to the stop** and the enum **expands** to
  `remote-work | recovery | travel | crag | alpine`. Rationale: travel / recovery /
  remote-work days aren't climbs, so the day's character must live on the day, not
  the objective. *(Decision 🔸 — approved.)* The `Objective.day_type` field stays
  for the dossier's own crag/alpine hint; the committed *day's* type is the stop's.

### 2. Commit flow (extends the suggestion box)

"＋ Add to route" becomes **"＋ Add to a day"**:

1. User picks a date (defaulting within the relevant chapter).
2. Creates/links a stop with `start_date`, auto-resolved `chapter_id`,
   `objective_id`, and a `day_type`.
3. Promotes the objective out of the pool (existing `action:'promote'`).

Also surface the 💤 possible-climbs (`deferred`) queue as a commit source, not just
the `proposed` box — both feed the same "Add to a day" action.

### 3. Calendar lens (new read view)

A new page rendering **chapters → days → committed stops/climbs**. Each committed
day shows its `day_type` icon, a deep-link to the dossier (via `objective_id`), and
conditions where available. Uncommitted options stay in the pool, untouched. This is
a read lens first; editing continues to happen in the itinerary CMS.

### 4. Map fixes

- **Date-clip:** `LiveMap.astro` renders the route polyline + stops only where the
  resolved date `≤ today`. Future segments stay dark until reached. The route reads
  as a *breadcrumb being drawn*, not a plan preview.
- **Radar pulse:** an animated CSS bubble on the latest inReach `position`
  (currently near Forbidden Peak). Pure CSS/SVG; no new dependency.

### 5. Error handling & edge cases

- Stops with no/unparseable date: treated as undated — excluded from the calendar
  and from the map date-clip (shown only in the pool / itinerary editor), never
  crash the lens.
- A stop whose date falls in no chapter range: `chapter_id` left null; appears in an
  "unscheduled" bucket on the calendar.
- `objective_id` pointing at a deleted objective: render the stop's own name as
  fallback; no dead link.

## Build order (ship value early)

1. **Schema + seed the 9 chapters** — foundation (chapters table; stop columns;
   day_type enum expansion; backfill structured dates from existing free-text where
   parseable).
2. **Map clip + radar pulse** — the most visible complaint, fixed first; depends
   only on structured stop dates + position.
3. **Calendar lens** (read-only) — chapters → days → committed entries.
4. **Commit-to-a-day UX** — extend the suggestion box / possible-climbs queue.

## Out of scope (separate work)

- The `/objectives` 404 / "beta blank on phone" bug — parked, to be fixed
  immediately after this spine. (Beta page is SSR with no try/catch around the
  Supabase fetch; suspected the cause of blanks.)
- Multi-user / crew self-declare interactions on the calendar (Ryan etc. add their
  own legs via their own accounts — existing rails; not changed here).

## Open questions

None blocking. Calendar visual layout (month grid vs. vertical chapter scroll) to be
decided during implementation against the existing app aesthetic.
