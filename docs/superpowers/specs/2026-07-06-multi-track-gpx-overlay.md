# Multi-track GPX overlay — design spec

**Status:** proposed (not scheduled). **Origin:** 2026-07-06 peakbagger research — the insight that several successful ascent tracks overlaid on one map beat any single line. **Sibling:** panogram is building a similar feature against its annotation layer; keep the storage convention compatible (see §Schema).

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

## Out of scope (this spec)

Consensus-line computation (averaging tracks), cross-objective track browsing, elevation profiles. Panogram's bearing/triangulation math may eventually feed a shared consensus-line lib — revisit after both sides ship storage.

## Verification

Upload two GPX files to a test objective (one inReach export, one Gaia), confirm: both render overlaid with legend, RLS blocks cross-tenant reads (`npm run audit:tenants` extension), packet manifest picks up verified tracks, and `gpx_url` back-compat (GPX button unchanged).
