# D-Tours Trip Settings + Tailored Onboarding — Design

**Date:** 2026-06-17
**Status:** Approved (design); ready for implementation plan
**Author:** David + Shotgun
**Builds on:** `docs/superpowers/specs/2026-06-15-multiuser-front-door-privacy-design.md` (multi-user pivot — private RLS, `provision_trip` RPC, intent-driven `section_schema`, magic-link auth — all shipped)

## Problem

The multi-user front door ships, but a new user's trip is still **David's trip wearing a name tag**: the live-tracking feed, the "Fuel the trip" link, and the "Reach the crew" contact are all **hardcoded to David** via env vars and a baked-in component, and onboarding **force-clones David's Seattle/PNW template**. For a real multi-user product, each trip must be the owner's own — their tracker, their contact, their money, their privacy choices — built to fit their trip, not David's.

## Goal

A trip is fully the owner's: a **CMS Settings page** for per-trip configuration, **tailored onboarding** that builds *their* trip (not a forced clone), and a **location-privacy** control so a traveler can keep their precise position off the public map. David's existing trip is byte-identical after migration (he becomes the first tenant using per-trip settings instead of env vars).

## Non-goals (deferred)

- Generalizing Shotgun's auto-seed *research* beyond climbing (separate workstream #3).
- Payments/entitlements, CDN caching (later releases).
- Non-Garmin GPS providers (Gaia, phone-only) beyond the existing companion `/track` mechanism — Garmin MapShare (inReach + other Garmin shares) uses one KML format and is in scope; other providers are future.

## Verified current state (2026-06-17)

- **Live position:** `mapsharePosition()` in `src/pages/api/trips.ts` (and `src/lib/proximity.ts`) reads `process.env.MAPSHARE_FEED_URL`, fetches the Garmin **KML** feed, and parses the last `<coordinates>` + `<when>`. Returns `null` when unset.
- **Fuel/support:** `PUBLIC_VENMO_URL` env, used in `src/pages/index.astro` (hero "💸 Fuel the trip") and `src/components/CheerSquad.astro`.
- **Contact:** `src/components/ReachUs.astro` assembles David's phone (`12063979040`) + email (`me@davidpuerto.com`) client-side; iMessage shown on Apple, email always.
- **Per-row MapShare already exists for companions:** `companions.mapshare_url` (set in `src/pages/cms/squad.astro`) — the per-entity feed pattern is proven; the *owner's* feed just needs the same treatment.
- **`tenants` columns today:** `slug, name, tagline, owner_email, owner_id, interests, is_default, visibility, intent_text, section_schema, is_template`.
- **`provision_trip(p_intent, p_name)`** SECURITY DEFINER RPC clones the `is_template=true` Seattle/PNW tenant (chapters/objectives/stops) and stamps a generic fallback `section_schema`. Owner CMS reads via the request-scoped RLS client; public reads via the anon (public-branch) client.

---

## Part 1 — Data model + Settings page

### A. New `tenants` columns
```sql
alter table tenants
  add column if not exists mapshare_feed_url text,
  add column if not exists location_sharing  text not null default 'approximate'
    check (location_sharing in ('precise','approximate','off')),
  add column if not exists contact_email     text,
  add column if not exists contact_phone     text,         -- optional; enables the iMessage button
  add column if not exists support_links     jsonb not null default '[]';
```
`support_links` is a small list — `[{ "label": "Venmo", "url": "https://venmo.com/u/…" }, { "label": "Text me", "url": "sms:+1…" }]` — so an owner can add Venmo *and* PayPal *and* "email me" without us hardcoding platforms. Each entry: `{ label: string, url: string }`.

### B. Backfill David's tenant (zero public change)
Backfill `david` from today's env/component values: `mapshare_feed_url` = `MAPSHARE_FEED_URL`, `location_sharing='precise'` (his current behavior), `contact_email='me@davidpuerto.com'`, `contact_phone='12063979040'`, `support_links=[{label:'Venmo', url: PUBLIC_VENMO_URL}]`. Result: David's public site is identical; he's now the first tenant on per-trip settings. **New trips** default to `location_sharing='approximate'`.

### C. `/cms/settings` (new owner-gated page)
A focused Settings page: trip **name/tagline**, **🛰️ tracking feed** (`mapshare_feed_url`), **🔒 location privacy** (`precise` / `approximate` / `off`), **📇 contact** (email + optional phone), **💸 support links** (add/remove rows), and the **share-my-plan** visibility toggle (`tenants.visibility`). Owner-only writes go through the existing `requireOwner` + tenant-scoped pattern. Read/write via `/api/settings` (owner-gated), validating `location_sharing` enum and that `support_links` entries are `{label,url}` with http(s)/mailto/sms/tel URLs.

---

## Part 2 — Onboarding, privacy logic, component wiring

### D. Tailored onboarding (guided, light)
`/welcome` stays short — **name + "what's the trip?"** (required) + a **start choice**: *"start blank"* (default) or *"start from the Seattle/PNW example."* `provision_trip` gains a `p_from_template boolean default false`:
- **false** → create the tenant + owner crew, stamp the generic fallback `section_schema`, and seed a single starter chapter (e.g. "Day 1") so the itinerary/map aren't stark-empty. **No Seattle clone.** Sonnet upgrades the section schema from `intent_text` async (existing path).
- **true** → clone the `is_template` tenant (today's behavior).

New tenants get `location_sharing='approximate'`. After landing in the CMS, a one-line **"👋 Finish setting up your trip → Settings"** banner (shown until they've set a tracking feed or dismissed it) points at the tracking/contact/fuel fields — so onboarding isn't a 10-field wall.

### E. Location privacy (public-map fuzz)
A pure helper `publicPosition(pos, location_sharing)`:
- `precise` → exact `pos` (today's behavior)
- `approximate` → round `lat`/`lng` to **1 decimal** (~11 km, city-level) before returning
- `off` → return `null` (no public dot)

Applied **only on public reads** (`/api/trips`, the live map data path for a tenant whose viewer isn't the owner). The **owner's CMS view always shows exact** coordinates. The owner-vs-public distinction reuses the request-scoped client already in place (owner request → exact; anon/public → fuzzed).

### F. Components read per-tenant (env as fallback for David)
- `mapsharePosition(tenant)` → fetch `tenant.mapshare_feed_url` (fallback `MAPSHARE_FEED_URL` only for David's tenant), then pass through `publicPosition()` for public callers.
- `ReachUs` → take `contactEmail` / `contactPhone` props from the page's resolved tenant (fallback to the existing hardcode only for David's tenant). Keep the client-side assembly (anti-scraper) but feed it the tenant values.
- Hero "Fuel the trip" + `CheerSquad` → render from `tenant.support_links` (fallback `PUBLIC_VENMO_URL` for David). Empty list → no fuel buttons.

Each fallback is **David-tenant-only** so other trips with empty settings simply show nothing (not David's links). Once the backfill (B) runs, even David reads from his tenant row; env vars remain as ultimate safety fallback.

---

## Components & boundaries

| Unit | Responsibility | Depends on |
|---|---|---|
| `tenants` settings columns | Persist per-trip config | migration + backfill |
| `getTenantSettings(tenant)` | Resolve settings with David-only env fallback | `data.ts` |
| `publicPosition(pos, sharing)` | Pure location-privacy fuzz | — (unit-tested) |
| `/api/settings` + `/cms/settings` | Owner reads/writes settings | `requireOwner`, RLS |
| `mapsharePosition(tenant)` | Per-tenant feed fetch + privacy | feed KML, `publicPosition` |
| `ReachUs` / fuel components | Render owner contact + support links | tenant settings |
| `provision_trip(intent,name,from_template)` | Tailored vs template provisioning | template tenant |

## Error handling
- Empty/invalid `mapshare_feed_url` → no live dot (today's `null` behavior); never throws.
- Malformed `support_links` rejected at `/api/settings` write; render skips bad entries.
- `location_sharing` constrained by DB check; `publicPosition` treats unknown as `approximate` (safe default).
- Onboarding provision failure rolls back (RPC is atomic); user retries.

## Testing
- **Pure libs:** `publicPosition` (precise/approximate/off, rounding) → `npm test`.
- **provision_trip** `from_template` true/false → extend `scripts/test-provision.mjs` (template-clone vs scaffold).
- **Cross-tenant isolation** still green (`npm run audit:tenants`) after the new columns/page.
- **Backward-compat:** David's public home/map/contact/fuel unchanged post-backfill (manual + `astro build`).

## Slicing (chapters / pivot pattern — commit per slice)
1. **Migration:** settings columns + check + backfill David's tenant from env values.
2. **Settings data layer:** `getTenantSettings()` + extend `Tenant` type; `publicPosition()` pure lib + tests.
3. **`/cms/settings` page + `/api/settings`** (owner-gated read/write, validation).
4. **MapShare per-tenant + location fuzz:** `mapsharePosition(tenant)` reads tenant feed; public reads fuzzed via `publicPosition`.
5. **Contact per-tenant:** `ReachUs` reads tenant contact (David-only fallback).
6. **Fuel per-tenant:** hero + `CheerSquad` render `tenant.support_links` (David-only fallback).
7. **`provision_trip` template-optional + onboarding blank/example choice + "finish setup" CMS banner.**

Slice 1 (backfill) makes David's trip identical before any component switches to per-tenant reads, so nothing breaks mid-migration.
