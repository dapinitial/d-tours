---
name: climbing-data
description: This skill should be used to fetch climbing route/crag data — "what climbs are near X", grades, crag lookups for objective dossiers — via OpenBeta (product-safe), or to study Mountain Project's data/topo schema (dev-time research only). Triggers: climbs near a point, route grades, crag info, dossier beta, topo schema questions.
---

# Climbing Data

Two sources, two lanes. **Never cross them.**

| | OpenBeta | Mountain Project |
|---|---|---|
| Script | `scripts/openbeta.mjs` | `scripts/mp-api.ts` |
| License | Open (CC) — **safe for product code, dossiers, anything** | Private mobile API, unlicensed — **dev-time research ONLY** |
| Use for | Climb names/grades/crags near a point; data that lands in `beta`, dossiers, features | Schema study (topo encoding), one-off comparisons; never imported by product code, never in a cron |

This lane split is a standing rule shared with the panogram project. If a feature needs climbing data, it uses OpenBeta; if OpenBeta lacks coverage, the answer is "gap in OpenBeta," not "fall back to MP."

## OpenBeta (product-safe)

Zero-dep GraphQL client with retry (their API 502s intermittently — retries 3× with backoff automatically).

```bash
# Crags near a point (miles radius; verified: 219 crags at Squamish)
node .claude/skills/climbing-data/scripts/openbeta.mjs near --lat 49.68 --lng -123.15 --miles 8

# One crag's climbs with grades (YDS + V-scale) and type flags
node .claude/skills/climbing-data/scripts/openbeta.mjs crag --id 6d7fef82-be87-5457-bb8a-9117851a4f5b

# Find an area by name (verified: "Cirque of the Towers" → 56 climbs, uuid + path)
node .claude/skills/climbing-data/scripts/openbeta.mjs search --q "Cirque of the Towers"
```

API: `https://api.openbeta.io` (GraphQL, no key). Areas are a tree (`pathTokens`); `cragsNear` returns distance-bucketed groups; grades come as `{ yds, vscale }`. Store OpenBeta `uuid`s when linking objectives to external route data.

## Mountain Project (dev-time research only)

`scripts/mp-api.ts` is vendored from onXmaps/mp-tools with the anonymous mobile-API access (`npx tsx mp-api.ts getPhotosTopos --areaId <id>`; endpoints: getPhotosTopos, getPhotos, getTicks, getRouteInfo, getPackageList, getPackageForArea/Route). The DEV-ONLY banner at the top of the file is the contract:

- OK: studying how MP encodes interactive topos (`references/mp-topo-schema.md`), sanity-checking OpenBeta coverage, personal curiosity during dossier research.
- NOT OK: importing it from `src/`, calling it from any cron/endpoint, storing its data in tenant-facing fields, shipping anything derived from it to users.

MP route/area IDs come from mountainproject.com URLs (e.g. `/route/105717329-...`).
