# 🚐 D-TOURS — Platform Spec

> **An AI travel companion that rides shotgun on the Austin → Squamish mega-loop.**
> It knows your hard deadlines and your slack, spends the slack on weird/wild detours,
> and still lands you on time. The blog, map, and comms are just how D-Tours talks to
> you and remembers the trip.

**Name:** product = **D-Tours** (detours · tours · *D* for David). Companion persona/voice = **"Shotgun"** (it rides shotgun, texts you).

- **Lives at:** spacelabforever.com (currently deployed on DigitalOcean)
- **Owner:** David Puerto (me@davidpuerto.com)
- **Status:** Spec / brainstorm captured 2026-06-04. Pre-build.
- **Trip window:** ~early July → Aug 1 (Spokane wedding, HARD deadline) → Squamish

---

## 0. Thesis

The novel, defensible idea is **not** the POI map (that's commodity OpenStreetMap data) —
it's the **agentic companion**: a schedule-aware agent that proactively proposes detours
that *fit the time you actually have*, and pushes them to you through whatever channel can
reach you right now. Everything else (CMS, map, social) is in service of that.

---

## 1. Two products (don't conflate them)

| | **A — Beta Dashboard** | **B — Live D-Tours Platform** |
|---|---|---|
| What | Offline, print-to-PDF trip plan | Public site + AI companion + comms |
| Constraint | Static, works with zero signal | Dynamic, online, multi-contributor |
| State | **Ship first** (Phase 0) | Phased build |
| Relationship | Becomes the "Trip Plan" page/widget set inside B | Absorbs A |

A is a single self-contained HTML file (slate/forest/white dark aesthetic, sortable
objectives table, route timeline, logistics directory, comms/power/nav section, packing
checklist, `@media print` rules). It doubles as the **visual prototype for B's widgets.**

---

## 2. Decisions locked

| Decision | Choice | Notes |
|---|---|---|
| Domain | **spacelabforever.com** | On DigitalOcean already |
| Scope now | Ship dashboard → plan platform | |
| CMS bones | **Reuse SuperComposer** (`~/Sites/supercomposer`) | Next.js 15 / React 19 / Drizzle, mid-port to Supabase + BYOK; its send-engine + block editor ≈ 80% of what we need |
| Live geo | **Garmin inReach MapShare KML feed** | The ONE feed that's live while off-grid |
| Media | **Own bucket (DO Spaces / Supabase Storage) + gated upload form** | ⚠️ Google Photos shared-album API was killed Mar 2025 — see §8 |
| Social | **Gated live comments + likes** via Supabase magic link | Gating dissolves the off-grid moderation risk |
| Control surface | **Official Anthropic iMessage plugin for Claude Code** | Text yourself → iMac acts → texts back |

---

## 3. Architecture overview

```
                 ┌─────────────────────────────────────────────┐
   YOU (truck)   │  spacelabforever.com (DigitalOcean)          │
   phone +       │  Next.js (SuperComposer bones) + Supabase    │
   inReach +     │  - CMS: posts, days, objectives, hazards     │
   Starlink      │  - widgets (derived from SC blocks)          │
        │        │  - live map (MapShare poll + Strava tracks)  │
        │        │  - gated likes/comments (magic link + RLS)   │
        │        │  - media in DO Spaces / Supabase Storage     │
        │        └───────────────▲─────────────────────────────┘
        │  position (MapShare)    │ publish / sync (Tier 2)
        ▼                         │
  ┌───────────────────────────────┴───────────────┐
  │  HOME iMac — "Basecamp Dispatcher"             │
  │  Claude Max + Claude Code (scheduled/headless) │
  │  + official iMessage plugin                     │
  │  → runs D-Tours look-ahead            │
  │  → routes pings via comm-escalation engine     │
  └────────────────────────────────────────────────┘
```

- **Host:** keep DigitalOcean (App Platform or droplet). Supabase = managed Postgres +
  Auth + Storage (hosted separately), or self-host PG on DO. Site should be PWA /
  offline-cacheable so the Trip Plan works with no signal.
- **Reuse:** SuperComposer already has the AI-assist (BYOK Anthropic), `scheduledSends`,
  `recipientLists`, block editor, HTML/PDF export, screenshots. D-Tours = a new content
  type ("Field Journal" / "Day" / "Detour") + the send-engine pointed at *you* instead of
  email campaigns.

---

## 4. Connectivity tiers (the spine)

| Tier | Where | Available | Behavior |
|---|---|---|---|
| **1 — Moving / on route / backcountry** | Dish stowed | inReach Mini (sat text + MapShare), goTenna (party mesh, NO internet), Gaia offline | Posts/check-ins **queue**; only MapShare position goes live |
| **2 — Parked at the rig** | Starlink up on EcoFlow | Full broadband | **Flush the queue** — upload media, publish posts, run heavy syncs |

Design rule: **queue on Tier 1, flush on Tier 2.** Same pattern governs your posts AND the
pre-moderated parts of the site.

---

## 5. Comm-escalation engine

One reminder, routed to whatever can actually find you:

| Your state | Channel |
|---|---|
| At the rig (Starlink) | **Email** (rich digest, photos, map pins) |
| Cell, no dish | **iMessage/SMS** (short essentials) |
| Truly off-grid | **inReach** (one-line hazard/safety ping) |

Off-grid compression example (fits a sat text):
`♨️ Hot spring 8mi · exit 54 · 0.5mi off-route · ~45min · you're +2hr ahead`

**Outbound use cases:** daily "day ahead" digest (Claude-composed from itinerary),
geofenced triggers (e.g. nearing Big Sandy dirt road → "air down, top off, check
undercarriage for porcupine bait"), weather/lightning hazard alerts (NWS), deadline nudges
(wedding attire, permits), "text Chels you're 2hr out."

**Inbound:** post-by-text — text a photo+caption → becomes a journal post (no app, one bar).

---

## 6. D-Tours engine (companion voice: "Shotgun")

Runs on the **home iMac on the Claude Max sub** (scheduled Claude Code agent). The
"basecamp dispatcher with all the maps and the whole internet." Texts you in the voice of
**Shotgun**, the companion persona.

Two things make it smart, not a POI dump:
1. **Look-ahead corridor** — searches a tube along the *next 2–4 hrs of planned route*
   (MapShare gives heading + speed), not "near me."
2. **"Do I have time?"** — cross-references **schedule slack**. → **Every itinerary entry
   needs a `flex` field** (hard-deadline vs. soft). Hard day → only water/gas/food. Soft day
   → surface the skydive / Meow Wolf / rave.

Loop closes: `position → look-ahead → time-check → ping by tier → you detour → you post → back on site.`

---

## 7. iMessage control surface ✅ (verified — now first-party)

Anthropic ships an **official iMessage plugin for Claude Code** — fully local (reads
`chat.db`, sends via AppleScript), with **built-in access control** (allowlist by
contact/Apple ID, code-pairing, or self-chat only), group mention patterns, and
access-control changes that can ONLY be made from the terminal (blocks prompt injection).

This is the unifying control surface: **one Messages thread = D-Tours + post-by-text +
dispatcher.** You text it blind, one-handed, from a moving truck; the iMac acts and texts
back; iCloud syncs both ways.

**Guardrails (non-negotiable for an agent that acts as you):**
- Scope to ONE dedicated control thread; filter chat.db to that thread only (privacy).
- Allowlist actions; gate destructive / send-to-others behind explicit confirm.
- **Heartbeat:** agent texts "🟢 alive" each morning. Silence = it's down (iMac reboot,
  Messages quit, iCloud sign-out, home power/network loss). inReach is the independent
  manual fallback — two channels that can't die together.

---

## 8. Data source inventory (verified June 2026)

### 🟢 Build on these (free / clean)
| Want | Source | Notes |
|---|---|---|
| Water, gas, food, viewpoints, campsites, attractions | **Overpass / OpenStreetMap** | bbox query along corridor; no key; open license — the workhorse |
| Notable landmarks near route | **Wikidata / Wikipedia GeoSearch** | free, by-coords, open license |
| Plants & animals near you now | **iNaturalist API** | free; check terms for any commercial use |
| Campsites, permits, fees, passes | **Recreation.gov / RIDB** | free, federal |
| Park alerts, scenic routes, things-to-do | **NPS API** | free |
| Weather / lightning viability | **NWS / mountain-forecast** | free |
| Festivals / concerts / raves along route | **Ticketmaster Discovery + Bandsintown/Songkick** | real APIs |

### 🟡 Keyed / paid
| Want | Source |
|---|---|
| Restaurants/gas w/ hours, ratings, "is it open" | **Google Places** |
| inReach live dot | **MapShare Raw KML** `share.garmin.com/Feed/Share/<name>` (leave feed password OFF) |

### 🟠 No clean API → D-Tours web-search + pre-trip curation
- **Atlas Obscura / Roadside America** — Meow Wolf, Garden of 1000 Buddhas, Eminem's house,
  giant-ball-of-twine. No open API (scraping = ToS risk) → live Claude research.
- Roadside bungee, skydive, white-water, Burning Man, Ren faires — commercial operators,
  spotty data. Pre-load a curated "stuff I'd stop for" list per corridor before losing signal.

### 🔴 Avoid / careful
- **Strava** — ⚠️ Nov-2024 terms: **bans using data in AI/ML, and bans showing/disclosing
  it to anyone but the owner.** OK for *your own personal* tracks displayed to *you*; a
  **landmine for any AI feature or commercial/ad product.** Do NOT build the product on it.
- **Google Photos** — Library/shared-album API killed Mar 2025 (403). Only the **Picker
  API** survives (user manually picks own photos per session). → media lives in **our own
  bucket**, not Google Photos. GPhotos = manual Picker for your own shots only.
- **goTenna** — consumer line discontinued ~2022; mesh never touches the internet → party
  safety tool, NOT a website data source.
- **Mountain Project** — public API deprecated post-onX (~2021–22) → link-out only.
- **MapMyRun, Instagram/Facebook Graph** — closed / heavy app-review burden → skip for v1.

### Connectivity facts (verified)
- **iPhone Messages via satellite:** iPhone 14+, iOS 26, US/CA/MX/JP, free 2 yrs, needs
  clear sky. **Catch: off-grid you can only RECEIVE from pre-designated emergency contacts**
  → it's send-mostly off-grid. inReach remains the reliable two-way off-grid channel.

---

## 9. Media storage (corrected)

Because Google Photos third-party album access is gone: **friends + you upload through the
site** (gated to the magic-link crew) → store in **DigitalOcean Spaces** or **Supabase
Storage**. EXIF GPS auto-places map markers. Self-hosted, robust, offline-cacheable, no
third-party rate limits. (Google Photos = optional manual Picker import of your own shots.)

---

## 10. Social

- **Likes:** per-user (identity exists via magic link → no double-tapping).
- **Comments:** **live, gated** to crew via **Supabase magic-link auth + Row Level
  Security** (everyone reads; only authed crew writes). Gating = near-zero spam = safe to
  be unreachable for a week. First-time magic-link click is mild friction (fine for known
  crew).
- Rich/overflow conversation can also live in a group thread; keep the public site a fast
  broadcast + curated comments.

---

## 11. Live geo

Poll **MapShare KML** on a timer → live "where's David" dot (works mid-Cirque, dish
stowed). Import **Strava tracks** (your own only) for approach/hike lines at Tier 2.
Manual **Gaia GPX export** for anything else.

---

## 12. Content model / widgets (derive from SuperComposer blocks)

Each dashboard section = a reusable widget. Core entities:
- **Day** (date, route segment, drive time, basecamp, `flex` field) — drives digest + D-Tours.
- **Objective** (the climbs — region, commitment, grade, hazard).
- **Detour** (D-Tours suggestion: type, off-route dist, time cost, fits-slack?).
- **Post / Check-in** (text, media[], geo, tier-published-at).
- **Hazard / Alert** (weather, road, wildlife).
- **Basecamp / Resource** (camp, water, hot spring, fuel, cleanup).

Every entity can both **publish** to the site AND **trigger** a comm.

---

## 13. Phased roadmap

- **Phase 0 — Beta Dashboard** (offline HTML, print-to-PDF). *Ship now.*
- **Phase 1 — Static live site** on DO: route map + MapShare live dot + manual journal posts.
- **Phase 2 — CMS** (SuperComposer-derived): post-by-text inbound, media bucket, widgets.
- **Phase 3 — Comms engine:** daily digest + geofenced/hazard pings, tier escalation.
- **Phase 4 — D-Tours:** home-iMac agent, look-ahead corridor, slack-aware detours.
- **Phase 5 — Social:** magic-link auth, gated comments, per-user likes.
- **Phase 6 (optional) — Business validation:** affiliate/freemium experiments IF strangers want it.

---

## 14. Open questions / decisions needed

1. **Hosting shape on DO:** App Platform (managed) vs droplet (full control)? Supabase
   managed vs self-hosted PG on the droplet?
2. **Does the iMac stay reliably on + Starlink-fed at home?** (Dispatcher uptime depends on it.)
3. **`flex` field taxonomy:** hard-deadline / soft / open — how granular?
4. **inReach plan tier** (tracking interval = position freshness; need MapShare enabled,
   feed password OFF for polling).
5. **Twilio 10DLC/A2P registration** if we do SMS (one-time form, few days' approval).
6. **Build dashboard standalone first, or scaffold it directly as Phase-1 page?** (Currently:
   standalone first.)

---

## 15. Business appendix (honest read)

- **Category is proven** (Roadtrippers, The Dyrt Pro ~$36/yr, Campendium, Atlas Obscura) →
  demand real, incumbents well-funded.
- **Only defensible angle = the agentic D-Tours** (schedule-aware proactive detours via
  your own comms). POI data is commodity OSM.
- **Monetization reality:** ads need big traffic; **affiliate** (book campsite/tour/raft/gear)
  and **freemium subscription** are realistic at small scale.
- **Landmines that are harmless personally but toxic commercially:** Strava (no AI, no
  third-party display), Google Photos (locked down), many "free" APIs prohibit resale, weird
  -Americana sources have no license to redistribute.
- **Verdict:** ship the personal D-Tours this summer; if strangers beg for it, *then* treat
  it as a startup. Don't let "could it be a business" delay the thing that's already fun and
  done-able.

---

## 16. Verified research notes (June 2026)

- Anthropic official iMessage plugin: https://claude.com/plugins/imessage ·
  https://github.com/anthropics/claude-plugins-official/blob/main/external_plugins/imessage/README.md
- inReach MapShare KML: https://support.garmin.com/en-US/?faq=Oa5mP2D5Zf7NZ8P17ATN58
- iOS Messages via satellite: https://support.apple.com/en-us/120930
- Strava API agreement (Nov 2024 restrictions): https://support.strava.com/hc/en-us/articles/31798729397773 ·
  https://press.strava.com/articles/updates-to-stravas-api-agreement
- Google Photos Picker API / Library deprecation (Mar 2025): https://developers.googleblog.com/en/google-photos-picker-api-launch-and-library-api-updates/

---

## 17. Brainstorm additions (2026-06-04 session)

### The multi-sport quiver (bringing ALL the gear)
Not just climbing — a full overland expedition:
- **Alpine trad + sport** climbing (full rack, draws).
- **Big hard scrambles** (approach shoes, helmet, short rope for short-roping).
- **Paddleboards / SUP** on lakes & reservoirs (Flathead Lake, Hungry Horse) —
  inflatable boards + pump + PFDs + leash.
- **Mountain bikes (likely e-MTB)** — bikes + rack + helmets/pads + tools.
  ⚡ **Synergy: EcoFlow charges the e-bike batteries at camp.**

Data: SUP → OSM `natural=water` / `leisure=slipway` (boat launches). e-MTB → Trailforks /
OSM `route=mtb` / Gaia. Scrambles → peakbagger / OSM / MP link-out.

### Shotgun's four "care" layers
Shotgun isn't a map — it's a companion that watches four things and proactively pings:
1. 🧗 **Climb/Adventure** — the objectives + quiver above.
2. 🛠️ **Life-maintenance** — *"got a place to sleep tonight? need a shower, shave,
   haircut, laundry? time to repair/replace gear?"* Tracks showers, laundromats,
   barbershops, gear shops/repair.
3. 🤸 **Move/Mobility (anti-car-rot coach)** — watches butt-in-seat time; prompts mat-out
   yoga, calisthenics (pull/push/dips/situps), plyos, 1–6mi runs, track days. Sitting for
   weeks is the real hazard.
4. 🌀 **Weird & Wonderful** — Meow Wolf, Atlas Obscura, Garden of 1000 Buddhas, roadside
   Americana, Area 51-tier detours.

### Training / recovery / pit-stop venues (all OSM-queryable)
- `leisure=fitness_station` → outdoor calisthenics / pull-up parks
- `leisure=track` → public running tracks · `leisure=pitch`+`sport` → school fields/courts
- `sport=climbing` / `leisure=sports_centre` → climbing gyms & rec centers
- Day-pass chains via Google Places: 24 Hour, Gold's, Planet Fitness, **YMCA**, community centers
- **Pit stops:** rest areas, truck stops, RV **dump stations**, showers
- **Free/dispersed camping:** iOverlander / FreeRoam / Campendium / Recreation.gov (BLM/NF) /
  OSM `tourism=camp_site`

### Trip color / human details
- **Ricardo's wedding** = the Aug 1 Spokane stop (HARD deadline).
- Dallas: visit **Whitley** + **Deep Ellum** for beers.
- **The rez in Oklahoma** (between TX and CO).
- Colorado: take **Chels & Jillian** on a hike.
- **Derek** (David's bro) drives from **Grand Rapids** to **Flathead Lake** in his **solar
  camper** — **rendezvous at Flathead before the wedding** (ties to the July 21 stop).

### Shotgun voice sample (the product in one breath)
> "You've got until Aug 1 to make Ricardo's wedding. On the way to Whitley, swing through
> Deep Ellum for beers, hit the rez in OK, then take Chels & Jillian on a hike. Lake +
> hot spring ahead if you want to rinse off, shave, and reset. You've been sitting 3hrs —
> rest area in 8mi has a field for a quick mobility flow. Derek's solar camper is 40min from
> Flathead; meet him there."

### Pending / parked
- `clapat → studio` rename across Montoya + Manifesto — survey was waved off; do later
  (backup-first sweep) on user's go.
- ✅ **Phase 0 dashboard — DONE.** Now the print-to-PDF `/plan` page in the Astro app
  (was going to be a standalone `index.html`; folded into the app instead).

---

## 18. Build decisions — LOCKED (2026-06-04)

- **Foundation:** **Astro** (static, sexy, fast — Montoya/Manifesto vibe) for the visitor
  site + a small **Supabase** service (Postgres/auth/storage) for CMS, posts, social.
  Shotgun's brain runs on the **home iMac via Claude Max**. (Chosen over forking
  SuperComposer; lift specific SC pieces — send-engine, block editor — as needed.)
- **Hosting:** **DO App Platform + Supabase managed.**
- **v1 scope:** **full clickable skeleton of all three surfaces** (Visitor / Shotgun comms
  / CMS), some features mocked, env placeholders for secrets so it runs immediately.
- **Comms — NO Twilio for v1.** Use **nodemailer** (email) + **carrier email-to-SMS
  gateway** for David's own phone (free; know own carrier) + the **official iMessage plugin**
  on the home iMac (reliable two-way). Abstract behind a `notifier` interface so Twilio is a
  drop-in later (only for reliable SMS to third parties / commercial scale).
  Channel priority: **iMessage → email → email-to-SMS → inReach (off-grid).**
  ⚠️ Email-to-SMS gateways are best-effort (spam-filtered, some carriers deprecating, flaky
  MMS) — fine for personal self-pings, not for strangers.
- **Media:** David's **own photos/videos for v1**; revisit/enhance with AI during & after trip.
- **Community AI enhancement (Phase later):** visitors **donate** (fund generation) or
  **BYOK** (own Anthropic/Google AI keys) to AI-"doctor" David's photos/videos; **owner
  approves** before publish. Keys server-side, **ephemeral, never client-exposed or stored
  plaintext.** Donations via Stripe/Ko-fi. Fits gated/pre-moderated model + SC's BYOK direction.

### Resulting architecture
```
Visitor site (Astro, on DO App Platform)  ──reads──▶  Supabase (posts, media, likes/comments, auth)
CMS (Astro routes / lightweight admin)    ──writes─▶  Supabase
Home iMac (Claude Max + Claude Code)      ──writes─▶  Supabase (digests, D-Tours suggestions)
        │  (iMessage plugin + nodemailer)
        └──pings──▶  David (iMessage → email → email-to-SMS → inReach)
MapShare KML  ──polled by──▶  iMac agent / Supabase function  ──▶  live map on visitor site
```

---

## 19. Build status — v1 skeleton SHIPPED (2026-06-04, /auto session)

Scaffolded at `~/Sites/d-tours/`. **Installs (308 pkgs), builds clean, all pages 200,
live D-Tours verified** (9 real POIs from Overpass near Lander, WY). Runs on mock data
with zero secrets.

**Run:** `cd ~/Sites/d-tours && npm install && npm run dev` → http://localhost:4321

Built:
- Visitor `/` (hero, flex-aware timeline, Leaflet live-map + MapShare poll, Shotgun sample,
  sortable objectives, four care-layers, hover gallery; reveal-on-scroll + custom cursor)
- `/plan` print-to-PDF Trip Plan (Letter, light bg, no awkward breaks) — the Phase-0 dashboard
- `/journal` (feed, open likes, gated-comments notice) · `/cms` (stats, composer, Shotgun controls)
- `notify()` comms (iMessage/email/email-to-SMS/inReach adapters + Twilio dark-stub)
- D-Tours Overpass look-ahead (fixed a 406 → needed User-Agent/Accept headers; added mirror fallback)
- `/api/{mapshare,digest,dtours,like}` · Supabase schema + RLS (open likes, crew-gated comments) + seed
- Home-iMac scripts: `npm run digest | dtours | mapshare`

**Next (needs David):** Supabase project + magic-link auth + real persistence/upload; supply
MAPSHARE_FEED_URL, SMTP, carrier gateway; Claude-Max voice pass on digest; geofenced/weather
triggers; comment moderation UI; BYOK/donation media (Phase later).

