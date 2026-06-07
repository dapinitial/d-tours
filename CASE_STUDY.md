# Case Study: D-Tours — an AI co-pilot for a 3-month climbing road trip

**What it is:** a multi-tenant travel companion (Astro SSR + Supabase, deployed on DigitalOcean App Platform at [shotgundetour.com](https://www.shotgundetour.com)) that rides shotgun on an Austin → Squamish climbing mega-loop. It runs the trip from a phone: a self-plotting journal, a live map, deep climbing dossiers, and a proactive AI ("Shotgun") that knows where you are and what's around you.

**The constraint that shaped everything:** the user is *driving* and often *off-grid*. Decisions have to survive flaky campground wifi, dead cell zones, and a hard deadline (a wedding in Spokane on Aug 1). So the system is built to be **proactive, location-aware, and resilient to bad networks** — not a static guidebook.

---

## The three systems

### 1. The proactive, location-aware co-pilot 🛰️
The site knows **where David is** (Garmin inReach MapShare KML feed) and **where every great climb is** (objectives carry `lat`/`lng`). That turns a guidebook into a co-pilot:

- **`/api/nearby`** ranks all objectives by distance with a rough drive-time and a within-N-hours flag (`haversine × 1.35 ÷ 45 mph`).
- The home **"Help us decide"** strip annotates each scouted alternative with *"~2.5h away"* from the live position and sorts nearest-first.
- **`/api/watch`** — the proactive alerter. A **Supabase `pg_cron` job** pings it every 30 min; it reads the live position, finds climbs within 3h that haven't been flagged (`objectives.alerted_at`), and **emails the dossier links** — then de-dups so there's no spam. Token-gated, and it *skips on a mock/missing GPS fix* so it never sends false alerts.

The loop: **you drive → the cloud notices you're rolling near something great → you get an email with the beta.**

### 2. The self-plotting journal 📍
Post a photo from the road and it places itself on the map:

- On upload, the server reads the photo's **EXIF GPS** (where it was actually taken).
- No GPS? It falls back to the **live inReach position** ("nearest ping").
- Geotagged posts drop as **📷 pins** on the live map — tap one for the photo + a link.

The journal literally draws itself along the route. (During testing this surfaced beautifully: a post with no photo-GPS pinned at *Forbidden Peak* — the last inReach fix from a 2024 trip — proving the fallback worked end to end.)

### 3. Shotgun's brain 🧠
An AI co-pilot (run on a local Claude Max session via the Supabase MCP) that:

- Builds **deep climbing dossiers** per objective — GPX, racks, approach, water, permits, hazards, an interactive field guide (edible/poison/medicinal plants, snakes, first-aid), weather/avalanche/fire links, comms plan.
- **Scouts pivots** — equally-awesome alternative climbs by grade/style/location, staged as "proposed" for review, then promoted into the itinerary.
- **Reads the journal as trip-memory** — recent geotagged posts ≈ David's real path and mood. It gauges how hard he's been pushing (3 alpine days → suggest a rest day, not another grade-pusher), avoids re-suggesting places he's already been, and grounds "where are we" in what he actually just climbed.

---

## The CMS: running a trip from a phone
A magic-link-gated CMS (owner-only, tenant-scoped) that does the whole job from the road:

- **Compose** posts with multi-photo upload + video embeds.
- **Manage thumbnails before posting** — drag to reorder, ✕ to delete.
- **Edit after the fact** — load any post back into the composer to add media or fix text.
- **Your posts** list with view / ✏️ edit / 🗑️ delete.
- **Shotgun controls** — trigger the digest, corridor scan, MapShare refresh.
- **Moderation** — approve comments, confirm rendezvous, promote proposed detours.

---

## The image pipeline: two real failures, two fixes 🖼️

This is where the road-trip constraints bit hard, and the fixes are the most interesting part.

### Problem 1 — a 18.8 MB phone photo
The first real upload was an **18.8 MB PNG**. Even when it loaded, it was painfully slow; often it just failed. Phone cameras shoot 15–25 MB HEIC/PNG — unusable on web as-is.

**Fix — resize + compress on upload (`sharp`):** every upload is now `rotate()` (auto-orient from EXIF) → `resize(2000px, fit inside, no enlarge)` → `mozjpeg q82`. An 18.8 MB image becomes a few hundred KB. **HEIC inputs are transcoded to JPEG** (HEIC doesn't render in most browsers). GIFs pass through to keep animation. The whole thing is isolated in a `try/catch` — *if sharp can't run, the original is stored, so an upload never fails.* (Same principle saved us earlier: an EXIF parser added as a top-level import had been silently crashing the entire upload route — moving it to an isolated dynamic import fixed it.)

### Problem 2 — the images wouldn't load at all (and neither would login)
Magic-link login hung, then images 404'd — but only on the user's home wifi, and only for one domain. The logs were the tell: **zero requests were reaching Supabase.** The browser couldn't resolve `*.supabase.co` — the wifi's **DNS filter was blocking it** (Supabase's domain gets flagged by some ad/tracker blocklists). The *site* loaded fine (it's served from our domain); only the **direct-to-Supabase calls** — auth and Storage images — were blocked. Cellular worked instantly, which confirmed it.

**Fix — an image proxy.** Images now serve through **`/img/<path>` on our own domain**: the DO server (which can always reach Supabase) fetches the object upstream and **streams it back, cached `immutable` for a year**. Existing post URLs were migrated from the raw Supabase URL to the proxy path in one SQL pass. Result: **images load on any network** — filtered campground wifi included — and the Supabase URL never leaves the server. Because uploads are already resized small, the proxy's bandwidth cost is negligible.

> Takeaway: when your app depends on a third-party domain *from the browser*, you've inherited that domain's reachability. Proxying first-party makes it bulletproof.

### Bonus — CSRF behind a proxy
Form/multipart POSTs (the Shotgun controls, photo upload) were getting blocked with *"Cross-site POST forbidden."* Astro's origin check compares the `Origin` header to the request host, but **behind DigitalOcean's proxy it sees the internal host**, so same-origin requests looked cross-site. Disabled Astro's origin check (`security.checkOrigin: false`) — the endpoints are still gated by Supabase's SameSite auth cookie.

---

## Architecture at a glance

```
Browser ──→ shotgundetour.com (Astro SSR on DO App Platform)
              ├─ /img/*          → proxies Supabase Storage (network-proof images)
              ├─ /api/upload     → sharp resize/compress + EXIF GPS → Storage
              ├─ /api/nearby     → rank objectives by drive-time from a position
              ├─ /api/watch      → proactive proximity alerts (email)
              └─ /api/post       → create / edit / delete journal posts (geotagged)

Supabase ──→ Postgres + RLS (multi-tenant), Storage (media), Auth (magic link)
Supabase pg_cron ──30 min──→ /api/watch   (always-on, no machine required)
Garmin inReach MapShare (KML) ──→ live position (the only feed live off-grid)
Claude (local, via Supabase MCP) ──→ Shotgun's brain: dossiers, pivots, journal-memory
```

**Resilience principles that emerged:**
- **First-party everything the browser touches** — proxy third-party domains (images) so a blocked DNS can't break the page.
- **Degrade, never fail** — EXIF, resize, and alerts are all isolated; a failure skips the feature, it doesn't break the request.
- **Proactive over static** — the system reaches out (you're near a climb; you've been pushing hard) instead of waiting to be asked.
- **Always-on without a server babysitter** — `pg_cron` runs the watcher in the cloud; the laptop doesn't need to be on.

---

## What's next
- Server-side image *variants* (thumb / full) so the map and gallery pull even lighter assets.
- Giving the web chat real tools (stage a proposal straight from a conversation).
- Two-way rendezvous ETAs with the second rig.
- EcoFlow / Starlink telemetry on the rig page.

*Built riding shotgun. 🚐🧗*
