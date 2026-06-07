# 📦 Offline Packet — Design Spec

**Date:** 2026-06-07
**Status:** Approved (brainstorm) → ready for implementation plan
**Roadmap:** P1, "finish the on-the-road kit" (`ROADMAP.md`)

## Problem

David is driving Austin → Squamish and is regularly off-grid (dead cell zones,
filtered campground wifi). The site holds the trip's reference content — climbing
dossiers, town/van-life guides, the skills library, interactive field guides, and
per-objective emergency contacts — but today all of it requires a live connection.
In a dead zone, the most safety-critical content (how to ID a poison plant, the
SAR number for the drainage you're in, the approach beta) is unreachable.

The offline packet makes the whole reference kit survive a dead zone: one tap
caches everything to the phone, and it all reads back with zero signal.

## Approach

Extend the **existing PWA** (the project already ships `public/manifest.webmanifest`,
`public/sw.js`, home-screen icons, and registers the service worker in
`src/layouts/Base.astro`). We are NOT introducing a new offline mechanism — we are
adding an explicit, user-triggered precache layer on top of the service worker
that's already installed.

The packet is **all-or-nothing and manually triggered** (not auto-cache-on-visit):
David is on metered Starlink/hotspot data, so caching the whole trip must be a
deliberate, predictable action with a visible size and an "Update" button — never
a silent background download.

### Why not the alternatives
- **Single self-contained HTML file** — rejected: loses the installed-app launch
  (home-screen icon, standalone) David already has, and duplicates rendering logic.
  The PWA reuses the real dossier pages verbatim.
- **PDF** — rejected: loses interactivity (field-guide cards, in-page search,
  collapsible dossiers), heavy with photos, awkward to regenerate as beta changes.

## Components

### 1. `/packet` page (new, public, `prerender = false`)

Public — all the content it indexes is already public, so squad members (Derek,
etc.) can install the packet too. Three responsibilities:

- **Download trigger.** One primary button: "⬇ Download for offline." Tapping it
  fetches the manifest, hands the URL list to the service worker, and renders live
  progress (`23 / 61 · 28 MB`). Resting state once cached:
  `✓ Ready — 61 items · 64 MB · updated Jun 7, 2:14p`, with **Update** (re-run) and
  **Clear** (drop the packet cache) controls. State is derived by asking the SW what
  it currently holds, so the page reflects reality across reloads.
- **Offline index / table of contents.** Lists every cached objective dossier, all
  16 town dossiers, and the skills library, grouped. When the app is opened off-grid,
  `/packet` is the hub that links to all saved content.
- **Aggregated emergency card** (pinned at the top). Merges every `beta.emergency`
  entry across all confirmed objectives (sheriff / SAR / ranger station / nearest
  hospital, with phone numbers) into one always-visible list, plus a generic
  911 + Garmin inReach SOS note. This is the single most safety-critical offline
  view and must read without any per-dossier navigation.

### 2. `/api/packet-manifest` (new endpoint, `prerender = false`)

Server-side assembly of the complete URL list to cache. Returns JSON:

```jsonc
{
  "version": "2026-06-07T14:00:00Z-<n>", // changes when content changes → drives "Update"
  "generated_at": "2026-06-07T14:00:00Z",
  "pages": [ "/packet", "/skills", "/objectives/<id>", "/stops/<id>", ... ],
  "images": [ "/img/<tenant>/<file>.jpg", "/extimg?u=<wikimedia>", "https://img.youtube.com/vi/<id>/hqdefault.jpg", ... ]
}
```

Assembly rules:
- **Pages:** `/packet`, `/skills`, one `/objectives/<id>` per **confirmed** objective
  (`status !== 'proposed'` — matches the public site; scouting alternatives excluded),
  one `/stops/<id>` per stop (all 16 towns).
- **Images:** for each objective's `beta`, collect `beta.photos[].url`,
  `beta.field_guide[].photo`, and each `field_guide` entry's host. Dossier photos are
  already first-party (`/img/...`). Field-guide photos are external Wikimedia URLs →
  rewrite to `/extimg?u=<encoded>` so they cache first-party (see component 3).
  Skill thumbnails → `https://img.youtube.com/vi/<id>/hqdefault.jpg` derived from each
  skill's `video_url` (YT thumbnails are reliably cacheable; the videos themselves are
  not — see "Video is out of scope").
- `version` is a stable hash/max-updated-at of the content so the page can show
  "update available" when the cached version differs.

### 3. `/extimg` proxy (new endpoint, `prerender = false`)

First-party proxy for **remote field-guide photos**, mirroring the existing `/img`
proxy's role for Supabase media. `/extimg?u=<url>`:
- **Allow-list: Wikimedia/Wikipedia hosts only** (`upload.wikimedia.org`,
  `*.wikipedia.org`, `commons.wikimedia.org`). Any other host → 400. This keeps it
  from being an open proxy.
- Fetches upstream, optional `?w=` sharp resize (reuse the `/img` pattern), streams
  back with `Cache-Control: public, max-age=31536000, immutable`.
- Field-guide rendering (in `src/pages/objectives/[id].astro`) rewrites each
  `field_guide[].photo` through `/extimg` so the photos are same-origin — the current
  `sw.js` deliberately skips cross-origin requests, so cross-origin Wikimedia URLs
  would never cache offline otherwise.

### 4. `sw.js` changes (surgical)

The existing strategy (network-first navigations, network-only `/api/*`, cache-first
assets) stays. Additions:

- **New cache `dtours-packet`**, kept SEPARATE from the rolling `dtours-v1` shell
  cache. The current `activate` handler deletes every cache whose key `!== VERSION` —
  update it to **preserve `dtours-packet`** so a version bump (which wipes the shell)
  never drops the downloaded trip.
- **`message` handler:** on `{ type: 'cache-packet', urls }` →
  `caches.open('dtours-packet')` then add each URL, posting progress
  `{ type: 'packet-progress', done, total }` back to the page (so the page can render
  `23 / 61`). Use resilient adds (per-URL `cache.add` in a controlled-concurrency loop
  with try/catch) rather than a single `addAll` so one failed image doesn't abort the
  whole packet. Also handle `{ type: 'clear-packet' }` (delete the cache) and
  `{ type: 'packet-status' }` (reply with count + rough byte size).
- **Fetch handler:** check `dtours-packet` FIRST for any GET request — if the packet
  holds it, serve from packet immediately (instant, works fully offline). Only then
  fall through to the existing network-first/cache-first logic. Offline navigation
  fallback order becomes: packet → existing VERSION cache → `/packet` → `/drive`.

### Data flow

```
Tap "Download for offline"
  → page GET /api/packet-manifest               (server assembles URL list)
  → page postMessage({type:'cache-packet', urls}) to the active SW
  → SW caches each URL into dtours-packet, posting {done,total}
  → page renders progress, then "✓ Ready — N items · X MB"

Later, off-grid:
  → any request → SW checks dtours-packet first → served from cache
  → /packet acts as the offline table of contents + emergency card
```

## Error handling & edge cases

- **Partial failures:** per-URL add with try/catch; a single failed image is logged,
  skipped, and reported in the final count (`58 / 61 cached — 3 images unavailable`),
  never aborting the download.
- **No service worker / not yet active:** the page detects `navigator.serviceWorker`
  and a controlling worker; if absent, it registers/waits, and shows a graceful
  "offline download needs the app — add to home screen" hint rather than failing.
- **Re-download / Update:** re-runs `cache-packet` over the fresh manifest; immutable
  image URLs are served from cache, changed pages overwrite. `version` mismatch
  surfaces an "Update available" affordance.
- **Storage pressure:** browsers can evict caches under pressure. The page reads live
  SW status on load, so it always reflects what's actually held (no false "Ready").
- **`/extimg` abuse:** strict host allow-list; reject everything else with 400.

## Testing

- `/api/packet-manifest` returns confirmed-only objective URLs (no `proposed`), all 16
  stops, `/skills`, `/packet`; images include `/img` + `/extimg` rewrites + YT thumbs.
- `/extimg` serves an allow-listed Wikimedia URL and 400s a non-allow-listed host.
- SW: `cache-packet` populates `dtours-packet`; a version bump preserves it; fetch
  serves packet entries offline; `clear-packet` empties it.
- Manual: install to home screen, tap Download, enable airplane mode, confirm every
  objective/town/skills page + photos + field-guide photos + emergency card render.

## Out of scope (YAGNI)

- **Video.** Every skill video is a cross-origin YouTube embed; YouTube cannot be
  service-worker-cached (cross-origin player, rotating signed `googlevideo.com` segment
  URLs, ToS forbids rehosting). Offline, skills show title + thumbnail + description and
  play when signal returns. A future feature could self-host `.mp4` files we own the
  rights to (e.g. a KAF Adventures library) in Supabase Storage, which WOULD be
  cacheable — tracked separately, not in this packet.
- PDF export.
- Background / automatic sync.
- Per-region or per-dossier selective download (all-or-nothing keeps it one tap).

## Related UI fix (bundled, separate from the packet)

The mobile bottom tab bar (`SiteHeader.astro`) is `grid-template-columns: repeat(6, 1fr)`
but renders 7 tabs (Drive, Journal, Plan, Rig, Gear, Skills, CMS) → it wraps. Move
**Drive (📡)** to a top-right header link on mobile (where `.top-nav` is otherwise
hidden), and drop Drive from the tab bar, leaving exactly 6 tabs that fit the grid.
This is independent of the packet and can ship immediately.
