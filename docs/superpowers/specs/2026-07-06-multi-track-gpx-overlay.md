# Multi-track GPX overlay — design spec

**Status:** proposed (not scheduled). **Origin:** 2026-07-06 peakbagger research — the insight that several successful ascent tracks overlaid on one map beat any single line. **Sibling:** panogram shipped its version 2026-07-06 (tracks as inline simplified `points jsonb` on posts, no tenancy). Reviewed: the storage shapes are too far apart to share a table convention — don't force it. What *is* shareable is panogram's dependency-free GPX parser/simplifier (`src/lib/gpx.ts`) and, later, a consensus-line lib consuming parsed point arrays; if we adopt the parser, fix its known flattening bugs first (multiple `trkseg` joined across gaps; `rtept` merged with `trkpt` instead of used as fallback).

## Problem

An objective today carries exactly one track (`objectives.gpx_url` + `gpx_verified`). Real planning wants several lines on one map: the standard route vs. our intended variation, approach vs. descent, this year's attempt vs. last year's, or three crew members' tracks from summit day. And after the trip, our own recorded tracks *are* the publishable beta.

## Licensing constraint (hard rule)

Only tracks we own or were explicitly given: inReach tracklogs, our Gaia exports, crew uploads, partner-shared files. Peakbagger/MP ascent tracks are other users' content — research-only, never stored or rendered (see climbing-data skill).

## Schema

New table (mirrors the `sources` pattern; keeps `objectives` lean):

```sql
create table tracks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  objective_id uuid not null references objectives(id),
  url text not null,            -- Storage 'media' bucket, like /api/gpx today
  label text,                   -- "W Ridge — our line", "descent gully"
  source text,                  -- inreach | gaia | crew | partner
  color text,                   -- render hint; assigned round-robin when null
  recorded_on date,
  verified boolean default false,
  sort int
);
-- RLS: same tenant-scoped policies as sources/gear (private-by-default, 0032 pattern).
```

`objectives.gpx_url` stays as the canonical/primary line (back-compat: packet manifest, GPX button). A migration backfills each existing `gpx_url` into `tracks` as `label: 'primary'`.

## API

Extend `/api/gpx` (owner-gated, multipart) with optional `label`, `source`, `recorded_on`; add `action: list|update|remove` JSON mode (same dual-mode shape as `/api/objectives`). First upload with no primary also stamps `objectives.gpx_url` (current behavior preserved).

## Render

Dossier page (`src/pages/objectives/[id].astro`): the existing map block draws every track for the objective as distinct-colored polylines with a small legend (label + source + verified badge). Toggleable per track; primary on by default, others off on mobile. Offline packet includes all verified tracks.

## Segments & waypoints → POI markers

Parsing must be **per-`<trkseg>`** (no lines bridging gaps) and must read `<time>` and `<wpt>` elements. Two candidate sources feed one confirmation flow:

- **Segment boundaries**: each gap yields a candidate marker at the pause location, with gap duration when timestamps exist (≥20 min midday → suggest 🥪 break; overnight → suggest ⛺ campsite; short/no-time gaps → suggest nothing, likely signal loss).
- **`<wpt>` waypoints**: name + `sym` mapped to a type guess (Garmin/Gaia symbols: Campground → ⛺, Water Source/Drinking Water → 💧, Flag/Pin → 🪨 landmark).

Candidates surface in the CMS as "found in your track — keep?" chips; owner confirms, types (⛺💧🥪🪨👀⚠️), and optionally notes. Confirmed markers flow into the structures dossiers already render: `beta.water[]` and `beta.poi[]` on the objective (or the stop's detour list for trip-level tracks) — no new render surface needed, and they inherit the packet/offline path. Store raw candidates on the track row (`waypoints jsonb`) so re-confirmation is possible; confirmed ones live only in beta/POI like hand-entered entries.

Timestamps also populate `recorded_on` automatically.

## Out of scope (this spec)

Consensus-line computation (averaging tracks), cross-objective track browsing, elevation profiles. Panogram's bearing/triangulation math may eventually feed a shared consensus-line lib — revisit after both sides ship storage.

## Verification

Upload two GPX files to a test objective (one inReach export, one Gaia), confirm: both render overlaid with legend, RLS blocks cross-tenant reads (`npm run audit:tenants` extension), packet manifest picks up verified tracks, and `gpx_url` back-compat (GPX button unchanged).
