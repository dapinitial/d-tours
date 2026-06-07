# 🚐 D-Tours

**An AI travel companion ("Shotgun") riding shotgun on the Austin → Squamish mega-loop.**
Lives at **spacelabforever.com**. Three surfaces, one system:

1. 🪟 **Visitor site** — sexy, editorial (Montoya/Manifesto DNA), live map, journal, gallery.
2. 📡 **Shotgun** — around-the-clock messages as you close on destinations, rendezvous & objectives.
3. 🗂️ **CMS** — run it all from phone or laptop (or by texting Shotgun).

> Full product spec: [`SPEC.md`](./SPEC.md). This README is the *how to run it*.

---

## Quick start (runs with ZERO secrets — mock data)

```bash
cd ~/Sites/d-tours
nvm use            # Node 20+
npm install
npm run dev        # → http://localhost:4321
```

Pages: `/` (home) · `/journal` · `/plan` (print-to-PDF) · `/cms` · API under `/api/*`.

With no `.env`, everything renders on **mock data** so you can click the whole thing today.
Add real keys when ready:

```bash
cp .env.example .env   # fill in what you have; all fields optional
```

## Architecture

```
Visitor site (Astro, DO App Platform) ─reads→ Supabase (posts, media, likes/comments, auth)
CMS (Astro routes)                    ─writes→ Supabase (service role)
Home iMac (Claude Max + Claude Code)  ─writes→ Supabase  ─and─ pings David:
   notify():  iMessage → email → email-to-SMS → inReach   (NO Twilio in v1)
MapShare KML ─polled→ live map dot (the only feed live while off-grid)
```

## 🛰️ Proactive location awareness (the on-the-road unlock)

The site knows **where David is** (live inReach MapShare) and **where every awesome climb is** (objectives have `lat`/`lng`), so it can be *proactive* instead of a static guidebook.

- **`src/lib/proximity.ts`** — shared geo helpers: `getLivePosition()` (parses the MapShare KML feed; returns a mock Cirque point + `mock:true` when no feed, so the watcher safely skips), `haversineMi()`, `driveHours()` (straight-line × 1.35 ÷ 45 mph).
- **`GET /api/nearby?lat&lng&hours`** — ranks all objectives (confirmed + proposed) by distance with a rough drive-time + a within-N-hours flag. Powers the location-aware **"Help us decide"** strip on the home page (each scouted alternative shows "~Xh away" from your real position and sorts nearest-first).
- **`POST /api/watch?hours=3`** — 🛰️ **the proactive watcher.** Reads the live position, finds climbs within N hours' drive that haven't been pinged about (`objectives.alerted_at`), **emails David the dossier links**, and stamps `alerted_at` so he isn't spammed. **Token-gated** (`WATCH_TOKEN`); **skips on a mock/missing GPS fix** (no false alerts).
- **The cron** — a scheduler pings `/api/watch` every ~30 min (Supabase `pg_cron` → `pg_net`, always-on in the cloud; no machine needed). So: *you drive → cloud sees you roll near a great climb → emails you the beta link.*

**Env it needs:** `MAPSHARE_FEED_URL` (the Garmin **Raw KML feed**: `https://share.garmin.com/Feed/Share/<name>` — NOT the page URL), `WATCH_TOKEN`, `NOTIFY_EMAIL` + SMTP. *(Note: carrier email-to-SMS is dead as of AT&T's June 2025 shutdown — alerts go via email; iMessage from a server isn't possible.)*

## Stack
- **Astro 5** (SSR via `@astrojs/node`) — fast static visitor pages + dynamic API routes.
- **Supabase** — Postgres, magic-link auth, storage. Schema in `supabase/migrations/`.
- **nodemailer** — email + carrier email-to-SMS gateway (free SMS, no Twilio).
- **Overpass / OSM, Wikidata, NWS** — key-free D-Tours data sources.
- **Shotgun's brain** runs on the **home iMac via Claude Max** (`scripts/*.mjs` on cron).

## What's wired (v1 skeleton)
- ✅ Visitor home: hero, route timeline (flex-aware), live-map (Leaflet + MapShare poll), Shotgun sample, sortable objectives, four care-layers, gallery
- ✅ `/plan`: print-to-PDF Trip Plan (Letter, light bg, no awkward breaks) — *the original Phase-0 dashboard*
- ✅ `/journal`: post feed, open likes, gated-comments notice
- ✅ `/cms`: stats, composer UI, Shotgun control buttons (digest / D-Tours / MapShare)
- ✅ `notify()` comms layer with all adapters + Twilio dark-stub
- ✅ D-Tours look-ahead hitting **live** Overpass (key-free) — proves the loop
- ✅ Supabase schema + RLS (open likes, crew-gated comments) + seed

## Wired next (see SPEC §13 roadmap)
- Supabase magic-link auth (owner + crew) and real CMS persistence/upload
- Comment moderation queue · itinerary editor with `flex`
- Claude-Max voice pass on the digest · geofenced + weather hazard triggers
- BYOK / donation AI media enhancement (owner-approved)

## Home-iMac scripts (Shotgun's brain)
```bash
npm run digest     # compose + send today's day-ahead
npm run dtours     # scan the corridor for detours (live OSM)
npm run mapshare   # print latest inReach position
```
Schedule with cron on the iMac, e.g. `0 6 * * * cd ~/Sites/d-tours && npm run digest`.

## Deploy (DO App Platform)
- Build: `npm run build` → run `node ./dist/server/entry.mjs`
- Set env vars in the App Platform dashboard (Supabase, SMTP, MAPSHARE_FEED_URL, NOTIFY_*).
- Point spacelabforever.com at the app.

---
*Note: messaging is **$0** in v1 — Shotgun rides free on Claude Max; SMS via carrier gateway.
Only AI media generation has variable cost, and it's off until you turn it on.*
