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
