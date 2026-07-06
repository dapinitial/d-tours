# Shotgun Detour API — endpoint catalog

All routes live in `src/pages/api/` (Astro SSR, `prerender=false`). Base URLs: `http://localhost:4321` (dev) and `https://shotgundetour.com` (prod). "Owner-gated" means a signed-in Supabase session whose `crew` row has `is_owner` for the tenant. Token-gated cron routes accept the token as `Authorization: Bearer` or `?token=` and are open when the env var is unset (local dev).

Generated 2026-07-06 by reading each route; re-verify against the code when a route's behavior matters.

## Tenant & onboarding

### /api/provision
- **Methods:** POST
- **Auth:** Supabase session (user) — any signed-in user
- **Params:** JSON body: `name` (string, required), `intent` (string, optional), `from_template` (boolean, optional; must be `true` to clone the Seattle/PNW example)
- **Does:** Creates the signed-in user's first trip via the `provision_trip` RPC (atomically makes tenant + owner crew row, optionally clones template); if `intent` is set, tailors `tenants.section_schema` via `generateSectionSchema` (Anthropic, no-op without key). Rate-limited. Tables: `tenants`.
- **Returns:** `{ ok, slug }` or `{ ok:false, error }`

### /api/settings
- **Methods:** POST
- **Auth:** owner-gated (signed-in owner, tenant-scoped)
- **Params:** JSON body: `name`, `tagline`, `mapshare_feed_url`, `contact_email`, `contact_phone`, `location_sharing` (precise|approximate|off), `visibility` (public|private), `support_links` (array of `{label,url}`, max 8) — all optional; at least one required
- **Does:** Updates per-trip settings on the owner's `tenants` row (tracking feed, privacy, contact, support links, visibility).
- **Returns:** `{ ok }` or `{ ok:false, error }`

### /api/rig
- **Methods:** POST
- **Auth:** owner-gated (tenant-scoped)
- **Params:** JSON body: `rig` object with any of `name, tagline, video_url, living, photos, capabilities, build, maintenance, bulbs, tools, service_log`
- **Does:** Upserts the single `rig` row for the tenant (onConflict `tenant_id`).
- **Returns:** `{ ok }` or `{ ok:false, error }`

### /api/companions
- **Methods:** POST
- **Auth:** owner-gated (tenant-scoped)
- **Params:** JSON body: `action` (add|update|remove|regen, required), `id`, `item` (fields: `name, nickname, emoji, color, role, leg, joins_at, joins_lat, joins_lng, status, status_note, mapshare_url, note, sort, published`)
- **Does:** CRUD on `companions` (the squad); `add`/`regen` mint a secret `track_key` (`trk_…`) for a personal phone-GPS share link.
- **Returns:** `{ ok, action, id, track_key? }` or `{ ok:false, error }`

## Geo & location

### /api/mapshare
- **Methods:** GET, POST (`export const POST = GET`)
- **Auth:** none
- **Params:** none
- **Does:** Polls the Garmin inReach MapShare KML feed via `getLivePosition`; returns latest point (mock position when no feed).
- **Returns:** position object `{ lat, lng, when, live/mock, … }` or `{ error }` (404)

### /api/checkin
- **Methods:** POST
- **Auth:** token-gated by secret `track_key` (unguessable `trk_` key; no session)
- **Params:** JSON body: `key` (string, required, must start `trk_`), `lat` (number, required), `lng` (number, required)
- **Does:** Phone-GPS check-in for companions without an inReach; updates `companions.last_lat/last_lng/last_seen` matched on `track_key`.
- **Returns:** `{ ok, name }`, `{ ok:true, mock }`, or `{ ok:false, error }`

### /api/nearby
- **Methods:** GET
- **Auth:** none
- **Params:** query: `lat` (number, required), `lng` (number, required), `hours` (number, optional, default 3)
- **Does:** Ranks `objectives` (incl. proposed) by distance from a position with rough drive-time + within-N-hours flag. Reads `objectives`.
- **Returns:** `{ from, hours, count, nearby[], all[] }` or `{ error }`

### /api/trips
- **Methods:** GET
- **Auth:** none (public feed; respects owner location-privacy)
- **Params:** none
- **Does:** Multi-trip map feed — for each registered trip (David default + Derek) builds reached/ahead route from `stops`, a current position (inReach feed → companion check-in → mid-route fallback), and confirmed `rendezvous` with live per-person ETAs. Reads `stops`, `companions`, `rendezvous`, `tenants`; fetches MapShare KML.
- **Returns:** `{ trips[], rendezvous[] }`

### /api/dtours
- **Methods:** GET, POST (`export const GET = POST`)
- **Auth:** none
- **Params:** query: `lat` (number, optional, default 42.7), `lng` (number, optional, default -109.2), `radius` (number, optional, default 25000), `cats` (comma-list, optional)
- **Does:** Live D-Tours look-ahead — queries OSM/Overpass (`lookAhead`) around a position, then diversifies results across POI categories. External: Overpass API.
- **Returns:** `{ at, count, detours[] }`

### /api/ahead
- **Methods:** GET, POST (`export const GET = POST`)
- **Auth:** none
- **Params:** query: `lat` (number, required), `lng` (number, required), `radius` (number, optional, default 20000)
- **Does:** "Don't miss out" filter — scans the corridor via `lookAhead`, scores each POI by a taste table, returns only notable, in-reach detours (≥ ping threshold). External: Overpass API.
- **Returns:** `{ at, pings, detours[] }` or `{ error }`

### /api/ask
- **Methods:** GET, POST (`export const POST = GET`)
- **Auth:** none
- **Params:** query: `q` (string; intent text), `lat` (number, optional, default 42.833), `lng` (number, optional, default -108.73)
- **Does:** Voice endpoint for the Siri Shortcut — keyword intent routing (immediate detour burst, status/deadline, staging, gear lookup, category detour) over `lookAhead`, `getStops`, `getGear`. External: Overpass API.
- **Returns:** `{ speech, …data }` (e.g. `detours`, `detour`, `gear`, `next`, `deadline`)

## Cron/proactive (token-gated)

### /api/watch
- **Methods:** POST, GET (`export const GET = POST`)
- **Auth:** token-gated — `WATCH_TOKEN` (Bearer or `?token=`); open when env unset
- **Params:** query: `token` (string), `hours` (number, optional, default 3)
- **Does:** Proactive watcher cron — reads live position, finds in-range un-alerted `objectives`, builds a `smartBrief` (Anthropic, falls back to plain list), emails David via `notify`, logs to `proximity_log`, and stamps `alerted_at` to de-dup. Reads `posts`; writes `proximity_log`, `objectives`.
- **Returns:** `{ ok, position, alerted, climbs[] }` or `{ ok:true, skipped }`

### /api/brief
- **Methods:** GET, POST (both defined)
- **Auth:** token-gated — `WATCH_TOKEN` (Bearer or `?token=`); open when env unset
- **Params:** GET query: `token`, `hours` (number, optional, default 4). POST: `token` + JSON body `text` (string, required), `subject` (string, optional), `ids` (string[], optional)
- **Does:** Local-brain data plane. GET assembles context (live position, weekday, recent `posts`, in-range candidate `objectives` with forecast) with no side effects. POST emails the finished brief via `notify` and optionally stamps `alerted_at` on `objectives` in `ids`.
- **Returns:** GET `{ ok, position, weekday, isWeekend, recent[], candidates[] }`; POST `{ ok, sent, marked }`

### /api/refresh-conditions
- **Methods:** POST, GET (`export const GET = POST`)
- **Auth:** token-gated — `WATCH_TOKEN` (Bearer or `?token=`); open when env unset
- **Params:** query: `token`
- **Does:** Daily conditions refresh (pg_cron) — pulls a 5-day Open-Meteo forecast per objective into `beta.conditions.forecast`, and fires send-window proximity alerts via `notify`. External: Open-Meteo API. Writes `objectives`.
- **Returns:** `{ ok, updated, of, window_alerts }` or `{ ok:true, mock }`

### /api/digest
- **Methods:** POST, GET (`export const GET = POST`)
- **Auth:** owner-gated OR token-gated — accepts `DIGEST_TOKEN` or `WATCH_TOKEN` (Bearer or `?token=`), else signed-in owner
- **Params:** query: `token`, `cadence` (daily|weekly, optional)
- **Does:** Composes today's digest (`composeDigest`), notifies David's channels via `notify`, and fans out to subscribers via `sendRaw` (SMTP). Reads `stops`, `detours`, `subscribers`.
- **Returns:** `{ composed, delivery, subscribers:{ total, sent, note } }`

## LLM

### /api/chat
- **Methods:** POST
- **Auth:** none (public; IP rate-limited + global daily cap `CHAT_DAILY_CAP`, default 500)
- **Params:** JSON body: `messages` (array of `{role,content}`, required, last must be `user`), `model` (haiku|sonnet|opus, optional; default `SHOTGUN_MODEL`/haiku)
- **Does:** Conversational trip co-pilot on the Anthropic API (needs `ANTHROPIC_API_KEY`); can call the `stage_proposal` tool to insert a `proposed` objective. Reads `stops`, `objectives`; writes `objectives` via tool. External: Anthropic.
- **Returns:** `{ ok, reply, staged[] }` or `{ ok:false, reply }`

### /api/commit-suggestions
- **Methods:** GET
- **Auth:** owner-gated (tenant-scoped)
- **Params:** query: `objective` (id, required)
- **Does:** Owner-only smart date suggestions for committing a climb — derives per-date weather verdicts from the objective's forecast and runs `suggestDays` against chapters/stops. (Heuristic, not an LLM call despite the group.) Reads `objectives`, `chapters`, `stops`.
- **Returns:** `{ ok, suggestions[], fallbackManual }` or `{ ok:false, error }`

## Content/CMS

### /api/objectives
- **Methods:** POST
- **Auth:** owner-gated (tenant-scoped)
- **Params:** JSON body: `action` (add|update|remove|promote|defer|reorder|requeue|update-beta, required), `id`, `obj` (fields: `name, region, commitment, grade, hazard, severity, discipline, day_type, sort, gpx_url, gpx_verified, status, note`; `add` also honors `lat/lng/force`), `items` (for reorder: `[{id,sort}]`)
- **Does:** Owner objective CRUD with duplicate guard (`findDuplicateObjectives`) and beta merge on `update-beta`. Writes `objectives`.
- **Returns:** `{ ok, action, id }`, `{ ok:false, dup:true, dupes }` (409), or `{ ok:false, error }`

### /api/itinerary
- **Methods:** POST
- **Auth:** owner-gated (tenant-scoped)
- **Params:** JSON body: `action` (add|update|stage|reorder|promote|decline|remove, required), `stop`, `id`, `items` (`[{id,order}]`), `detour` (for stage)
- **Does:** Owner itinerary mutation on `stops`; auto-files a dated stop into the chapter whose range contains it; `stage` drops a live Drive-Mode detour (`detourToStop`) just past the last stop. Reads `chapters`; writes `stops`.
- **Returns:** `{ ok, action, id, … }` or `{ ok:false, error }`

### /api/sources
- **Methods:** POST
- **Auth:** owner-gated (tenant-scoped)
- **Params:** JSON body: `action` (add|update|remove, required), `source` (fields: `url, title, note, tag, stop_id, objective_id`), `id`
- **Does:** Owner source/beta-library CRUD. Writes `sources`.
- **Returns:** `{ ok, action, id }` or `{ ok:false, error }`

### /api/skills
- **Methods:** POST
- **Auth:** owner-gated (tenant-scoped)
- **Params:** JSON body: `action` (add|update|remove, required), `id`, `item` (fields: `category, name, description, video_url, sort`)
- **Does:** Owner skills-library CRUD (pin/swap technique videos). Writes `skills`.
- **Returns:** `{ ok, action, id }` or `{ ok:false, error }`

### /api/gear
- **Methods:** POST
- **Auth:** owner-gated (tenant-scoped)
- **Params:** JSON body: `action` (add|update|remove, required), `id`, `item` (fields: `name, category, subcategory, emoji, status, qty, note, loaned_to, specs`)
- **Does:** Owner gear CRUD (`specs` freeform jsonb). Writes `gear`.
- **Returns:** `{ ok, action, id }` or `{ ok:false, error }`

### /api/post
- **Methods:** POST
- **Auth:** owner-gated (tenant-scoped)
- **Params:** JSON body: `action` (update|delete|omit for create), `id` (for update/delete), `title`, `body`, `media` (string[], max 12), `published` (bool → tier 2/1), `lat`, `lng`
- **Does:** Owner journal posting/edit/delete; geotags from EXIF coords or live inReach position (`getLivePosition`). Writes `posts`.
- **Returns:** `{ ok, id, published? }`, `{ ok, updated }`, `{ ok, deleted }`, or `{ ok:false, error }`

### /api/soundtrack
- **Methods:** POST
- **Auth:** owner-gated (tenant-scoped)
- **Params:** JSON body: `action` (approve|decline|remove|play|add, required), `id`, `track` (`title, url, kind, by, region, lat, lng, play`)
- **Does:** Owner moderation of `playlist_suggestions` — approve/decline/remove, `play` stamps `played_at`+location (auto-approve), `add` inserts a track directly. Writes `playlist_suggestions`.
- **Returns:** `{ ok, action, id }` or `{ ok:false, error }`

### /api/upload
- **Methods:** POST
- **Auth:** owner-gated (tenant-scoped)
- **Params:** multipart/form-data: `file` (image; jpeg/png/webp/gif/heic, ≤25MB, required)
- **Does:** Owner media upload to Supabase Storage `media` bucket; reads EXIF GPS (exifr), resizes/compresses (sharp, HEIC→JPEG). Returns same-origin `/img` proxy URL.
- **Returns:** `{ ok, url, lat?, lng? }` or `{ ok:false, error }`

### /api/gpx
- **Methods:** POST
- **Auth:** owner-gated (tenant-scoped)
- **Params:** multipart/form-data: `file` (.gpx, ≤5MB, required), `id` (objectiveId, required)
- **Does:** Owner GPX upload to Storage `media` bucket, then attaches `gpx_url` + `gpx_verified=true` to the objective. Writes `objectives`.
- **Returns:** `{ ok, url, verified }` or `{ ok:false, error }`

### /api/packet-manifest
- **Methods:** GET
- **Auth:** none
- **Params:** none
- **Does:** Assembles the offline-packet precache manifest (confirmed objective/stop pages, skills, images, YouTube thumbs) + a content `version` signature for the service worker. Reads `objectives`, `stops`, `skills`.
- **Returns:** `{ version, pages[], images[], counts }` (Cache-Control: no-store)

## Community (public submit + owner moderation)

### /api/comment
- **Methods:** POST
- **Auth:** dual — public submit (none) OR owner moderation (owner-gated when `action` present)
- **Params:** JSON body — submit: `author` (optional), `body` (required), `target` (post|objective), `id` (target id, required). Moderation: `action` (approve|decline|remove), `id`
- **Does:** Comments on objectives/journal posts; public submit lands unapproved and pings David via `notify`; owner approves/removes. Writes `comments`.
- **Returns:** `{ ok }` or `{ ok:false, error }`

### /api/like
- **Methods:** POST
- **Auth:** none
- **Params:** JSON body: `post` (id, required)
- **Does:** Increments a post's like count via `increment_like` RPC (no-op in mock mode). Writes `posts`.
- **Returns:** `{ ok }` or `{ ok:false, error }`

### /api/suggest
- **Methods:** POST
- **Auth:** dual — public submit (none, rate-limited) OR owner moderation (owner-gated when `action` present)
- **Params:** JSON body — submit: `title` (required), `location`, `note`, `by`. Moderation: `action` (approve|decline), `id`
- **Does:** Follower detour/stop suggestions → `suggestions` (pending); owner `approve` stages it onto `stops` as a proposed sidequest. Writes `suggestions`, `stops`.
- **Returns:** `{ ok }`, `{ ok, action, id, staged }`, or `{ ok:false, error }`

### /api/signup
- **Methods:** POST
- **Auth:** dual — public sign-up (none, rate-limited) OR owner moderation (owner-gated when `action` present)
- **Params:** JSON body — sign-up: `name` (required), `objective_id` (required), `role` (climb|ride), `contact`, `note`. Moderation: `action` (confirm|decline|remove|add), `id`, `signup`
- **Does:** Caravan climb sign-ups → `signups` (pending); owner moderates. Writes `signups`.
- **Returns:** `{ ok, role }`, `{ ok, action, id }`, or `{ ok:false, error }`

### /api/rendezvous
- **Methods:** POST
- **Auth:** dual — public propose (none) OR owner moderation (owner-gated when `action` present)
- **Params:** JSON body — propose: `name` (required), `place`, `when_text`, `note`, `lat`, `lng`. Moderation: `action` (confirm|decline|remove|add), `id`, `rdv`
- **Does:** Meet-up coordination → `rendezvous` (proposed); owner confirms/declines/adds. Writes `rendezvous`.
- **Returns:** `{ ok }`, `{ ok, action, id }`, or `{ ok:false, error }`

### /api/playlist
- **Methods:** POST
- **Auth:** none (public suggest; owner-moderated later via /api/soundtrack)
- **Params:** JSON body: `title` (required), `url`, `kind` (music|audiobook|podcast), `by`
- **Does:** Follower suggests music/audiobook → `playlist_suggestions` (pending). Writes `playlist_suggestions`.
- **Returns:** `{ ok }` or `{ ok:false, error }`

### /api/subscribe
- **Methods:** POST
- **Auth:** none (public; rate-limited)
- **Params:** JSON body: `email` (required, validated), `cadence` (daily|weekly, default weekly)
- **Does:** Follower subscribes to the recap; upserts `subscribers` and sends a best-effort welcome email via `sendRaw`. Writes `subscribers`.
- **Returns:** `{ ok, cadence }` or `{ ok:false, error }`
