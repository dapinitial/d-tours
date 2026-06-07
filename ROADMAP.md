# 🚐 D-Tours — Roadmap & State

The forward-looking companion to [`CASE_STUDY.md`](./CASE_STUDY.md) (the build story) and
[`README.md`](./README.md) (how to run it). **Austin → Squamish climbing road trip**, hard
deadline **Aug 1 Ricardo's wedding, Spokane**. Live at **www.shotgundetour.com** (Astro SSR on
DO App Platform + Supabase). This file = *where we are + what's next*.

---

## ✅ Shipped & live — and what each wins us

### Proactive engine (always-on, cloud)
Four **Supabase pg_cron** jobs hit token-gated app endpoints (no machine needed):
- **`dtours-proximity-watch`** (30 min) → `/api/watch` — emails when David rolls within 3h of a climb. *Win: never blow past a great line.*
- **`dtours-weather-refresh`** (daily 13:00 UTC) → `/api/refresh-conditions` — pulls real 5-day Open-Meteo forecasts into every objective's `beta.conditions.forecast` **and** emails a **send-window alert** when a bluebird window opens within ~10h (de-duped via `conditions.window_alerted`). *Win: be at the climb when the weather is right.*
- **`dtours-digest-daily`** / **`dtours-digest-weekly`** → `/api/digest?cadence=…` — the dispatch goes out automatically to subscribers. *Win: followers stay hooked with zero effort.*
- Tokens: `WATCH_TOKEN` gates watch + refresh + digest; `DIGEST_TOKEN` also accepted.

### Location awareness
- Objectives carry `lat/lng`; `/api/nearby` ranks by drive-time. Home "Help us decide" strip shows "~Xh away" from the live MapShare dot. *Win: decisions are spatial, not abstract.*

### Multi-user coordination (the Squad)
- `companions` table + `/cms/squad` editor. Home **Squad strip** (who rides which leg, status). `published` flag stages people privately.
- **Derek's phone tracker** — no inReach needed: `/track/<key>` uses browser GPS → `/api/checkin` → his dot on the map. Reusable for anyone (rendezvous with friends).
- **Rendezvous ETAs** — Flathead + the wedding seeded; `/api/trips` computes each person's live drive-time + a "converge in ~Xh". Drift is implicit (a wandering dot's ETA grows).

### Self-plotting journal
- Photo EXIF GPS → post location (fallback: live inReach position) → 📷 pins on the map. CMS: compose, drag-reorder/✕ thumbnails, ✏️ edit-after-the-fact, 🗑️ delete.

### Dossiers
- **Objective dossiers** (`/objectives/<id>`): ~35 beta keys each — GPX, racks, approach, water, permits, hazards, interactive **field guide** (edible/poison/medicinal/snakes/first-aid, 📷 indicator on chips), **live weather strip + send-window**, conditions links.
- **Stop dossiers** (`/stops/<id>`): all 16 towns seeded — eat/sleep/gas/coffee/resupply + van logistics (water/dump/showers/laundry/wifi). *Starters — Shotgun verifies on approach.*
- The **Plan** (`/plan`) is the hub: every stop links to its beta (climb → dossier, town → dossier) + coords + Google Maps directions.

### Skills library
- `/skills` — 33 curated rope/rescue/alpine videos (knots, coils, hauls, anchors, glacier, lost-device carabiner-brake) grouped, lazy inline embeds + search fallback. `/cms/skills` to pin/swap. *Win: refresh technique on the long drives.*

### Image pipeline
- Upload → `sharp` resize/compress (2000px, HEIC→JPEG, auto-orient). Served via **`/img/<path>` proxy** (cached, `?w=` on-demand thumbnails) so images load **even on networks that block supabase.co** — see [[dtours-network-gotchas]].

### Plumbing
- Magic-link auth (owner-gated CMS). Comments, Venmo tip jar, ReachUs (iMessage/email), Rig + Gear pages. Email via Gmail SMTP. `security.checkOrigin:false` (DO proxy false-positives).

---

## 🔜 What's next (prioritized)

### P1 — finish the on-the-road kit
- **📦 Offline packet** — one-tap download (self-contained HTML/PDF) of every dossier, town guide, skill list, field guide + emergency contacts, for dead zones. *(Next up.)*
- **Build log / features-and-wins doc** — partly covered by this file + CASE_STUDY; could expand into a shareable "what we built & why" page.

### P2 — make the proactive layer *smart*
- **Smart watcher** — let `/api/watch` (or a new daily brief endpoint) call the Anthropic API (cheap Haiku) **only when a trigger fires**, turning "you're near X" into a real recommendation reasoning over position + weather + journal (rest!) + Derek's ETA. *The big elevation.*
- **Morning briefing command** — `npm run brief` / saved prompt for the **local Claude Max** Shotgun: position + upcoming stops/objectives + journal + live web conditions → the day's call. Optional laptop cron.
- **Fire/smoke + avalanche auto-pull** — like the weather refresh but for InciWeb/AirNow (smoke) + avalanche.org. Currently link-only.
- **🔊 Voiced digest** — TTS so Shotgun reads the recommendation aloud, hands-free.

### P3 — polish & reach
- **Two-way text** — David emails/texts Shotgun a question from the road → smart reply (inbound email → API).
- **Per-objective weather thresholds** — alpine (wind/cold) vs desert (heat) tuning for send-windows.
- **Web-chat tools** — expand beyond `stage_proposal` (draft a post, add a town-dossier item).
- **Convergence readout** on the home map (not just rendezvous popups).
- **Ryan "Kanga ROO" Rugh** — re-add to the squad (one row) once he's 100% in; he was scrubbed at his request (SWE, reads the repo). Leg: Colorado → Squamish, joins ~Estes Park.

---

## 🛠️ How it's operated
- **Local Claude Max Shotgun** (laptop + Starlink/hotspot) = the deep brain: dossiers, pivots, web-researched conditions, town-dossier refinement, the morning brief. Flat-fee, web-enabled, reads/writes via the **Supabase MCP**. Brain lives in [`shotgun/CLAUDE.md`](./shotgun/CLAUDE.md).
- **Cloud crons** = the always-on safety net (watcher/weather/digest) for when the laptop's shut and David's on the wall.
- **Gotcha:** David's home wifi DNS-blocks `supabase.co` → magic-link login + raw Storage images fail there (use cellular or `/img` proxy). See [[dtours-network-gotchas]].

## Key files
- Endpoints: `src/pages/api/{watch,refresh-conditions,nearby,trips,checkin,digest,companions,skills,upload,post,chat}.ts`
- Pages: `src/pages/{plan,skills,track/[key]}.astro`, `src/pages/{objectives,stops}/[id].astro`, `src/pages/cms/*`
- Libs: `src/lib/{proximity,weather,data,types}.ts`, `src/pages/img/[...path].ts`
- Migrations through `0023_skills`. pg_cron jobs live in Supabase (`select * from cron.job`).
