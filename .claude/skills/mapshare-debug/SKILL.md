---
name: mapshare-debug
description: This skill should be used when the live map dot is missing, stale, wrong, or too precise/imprecise — debugging Garmin inReach MapShare feeds, per-tenant tracking config, companion phone check-ins, or the location-privacy fuzz. Triggers: "map isn't updating", "where is the dot", "MapShare feed", "location looks wrong".
---

# MapShare / Live Location Debugging

## How a dot gets on the map (the pipeline)

1. **Feed choice** (`src/pages/api/trips.ts:106`): each tenant's `mapshare_feed_url` (set in /cms/settings, column from migration `0037_trip_settings.sql`); the default tenant (David) falls back to env `MAPSHARE_FEED_URL`.
2. **KML parse**: fetch the Garmin Raw KML, regex the **last** `<coordinates>lng,lat</coordinates>` + last `<when>` — same logic in `src/lib/proximity.ts` (`getLivePosition`, env-feed only, used by watch/nearby/post geotag) and `/api/trips` (per-tenant).
3. **Fallbacks** (`/api/trips`): no feed point → latest companion phone check-in (`companions.last_lat/last_lng` via `/api/checkin` + secret `trk_` key) → mid-route position between reached stops.
4. **Privacy fuzz** (`src/lib/location.ts` `publicPosition`, applied at `trips.ts:73`): `precise` → raw; `approximate` (and any unknown value) → rounded to 0.1° (~11 km); `off` → no public dot. The owner's own CMS view bypasses this.
5. **Mock mode**: `getLivePosition()` with no env feed returns `{ lat: 42.7, lng: -109.2, mock: true }` (Cirque of the Towers) so the map renders; the watcher skips `mock` positions to avoid false alerts.

## Quick checks

```bash
# Poll a feed directly (prints latest point + timestamp)
MAPSHARE_FEED_URL="https://share.garmin.com/Feed/Share/<name>" npm run mapshare

# What the public map actually serves (post-fuzz)
node .claude/skills/api-client/scripts/sd-api.mjs trips --base prod

# Raw server-side position (env feed, pre-fuzz, mock-flagged)
node .claude/skills/api-client/scripts/sd-api.mjs mapshare --base prod
```

To inspect a tenant's feed URL / sharing setting, read `tenants.mapshare_feed_url` and `tenants.location_sharing` via the Supabase MCP.

## Symptom → cause

| Symptom | Likely cause |
|---|---|
| "No points in feed yet" / empty KML | inReach tracking is off, or the device hasn't sent a point this session. The feed only contains points from active tracking. |
| Feed fetch fails / HTML instead of KML | MapShare page password is ON — the Raw KML feed must be password-free (explore.garmin.com → Social → MapShare → Feeds → Raw KML), or the share name changed. |
| Dot frozen for hours | Device stopped tracking (power/battery/canyon); check `<when>` timestamp via `npm run mapshare` — the code takes the *last* point, stale is faithful. |
| Dot ~city-level accurate | Not a bug: `location_sharing='approximate'` fuzz (0.1° rounding). New trips default to approximate; unknown values also fuzz (never leaks precise). |
| No public dot at all, but owner sees one | `location_sharing='off'`. |
| Dot at Cirque of the Towers (42.7, -109.2) | Mock position — server has no `MAPSHARE_FEED_URL` (default tenant) or the tenant has no feed and no fallback fired. |
| Non-David trip shows no live dot | That tenant's `mapshare_feed_url` is empty — only the default tenant falls back to the env var. Set it in /cms/settings. |
| Companion dot wrong/missing | Check-in key mismatch or app stopped posting: `/api/checkin` needs `{ key: 'trk_…', lat, lng }`; re-mint via `/api/companions` `action: regen`. |

## Gotchas

- KML coordinates are `lng,lat` (Garmin order); the parsers swap to `{lat, lng}` — if a dot lands in the ocean, suspect an order regression.
- The regex parse assumes Garmin's Raw KML shape; a Garmin format change would break both `proximity.ts` and `trips.ts` the same way — fix both.
- `MAPSHARE_FEED_URL` is trimmed before use (stray whitespace in DO env once caused a silent no-feed).
