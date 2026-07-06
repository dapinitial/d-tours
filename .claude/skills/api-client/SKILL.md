---
name: api-client
description: This skill should be used when calling, testing, or debugging Shotgun Detour API endpoints (src/pages/api/) — fetching live trip/position data, exercising token-gated cron routes (watch, brief, refresh-conditions, digest), testing CMS mutations, or exploring API responses during development. Prefer this over hand-rolled curl.
---

# Shotgun Detour API Client

Call any of the ~34 API routes from the command line with `scripts/sd-api.mjs` (zero dependencies, Node ≥20). The full endpoint catalog — methods, auth, params, return shapes — is in `references/api-endpoints.md`; read it before guessing at params.

## Usage

```bash
node .claude/skills/api-client/scripts/sd-api.mjs <route> [--base local|prod|<url>] [--post] [--json '<body>'] [--key value ...]
```

- `--base local` (default) → `http://localhost:4321`; `--base prod` → `https://shotgundetour.com`; any other value is used as a raw base URL.
- GET by default: `--key value` pairs become query params.
- `--post`: pairs become the JSON body instead (or pass `--json '<raw json>'` for nested bodies).
- Output is pretty-printed JSON; non-200 prints `HTTP <status>` to stderr and exits 1.

## Examples

```bash
# Public reads
node .claude/skills/api-client/scripts/sd-api.mjs trips --base prod
node .claude/skills/api-client/scripts/sd-api.mjs nearby --lat 49.68 --lng -123.15 --hours 4
node .claude/skills/api-client/scripts/sd-api.mjs dtours --lat 42.7 --lng -109.2 --radius 30000

# Token-gated cron routes (token auto-attached, see below)
node .claude/skills/api-client/scripts/sd-api.mjs brief --base prod              # GET: context, no side effects
node .claude/skills/api-client/scripts/sd-api.mjs refresh-conditions --base prod --post
node .claude/skills/api-client/scripts/sd-api.mjs digest --base prod --cadence weekly

# CMS mutation (needs a session cookie — see Limitations)
node .claude/skills/api-client/scripts/sd-api.mjs like --post --post_id abc123
```

## Tokens & secrets

`watch`, `brief`, `refresh-conditions`, and `digest` are bearer-token routes. The script walks up from its own directory to the repo `.env` and reads `WATCH_TOKEN` / `DIGEST_TOKEN` (digest accepts either). Shell env vars override `.env`.

The tokens are deliberately **not** in the repo `.env` by default — they live as encrypted envs in the DigitalOcean dashboard (app `d-tours`) and in the installed launchd plist for the morning brief. To exercise these routes against prod, copy the token into `.env` locally (never commit) or prefix the command: `WATCH_TOKEN=… node … brief --base prod`.

**Side-effect warning:** `watch`, `digest`, and POST `brief` send real email/notifications; `refresh-conditions` rewrites `beta.conditions` and can fire send-window alerts. Against prod, prefer GET `brief` (read-only context) for testing; only fire the others deliberately.

## Limitations

- Owner-gated CMS routes (objectives, itinerary, settings, upload…) authenticate via Supabase session cookies, which this CLI does not manage. Test those through the browser/CMS, or read data directly with the Supabase MCP instead.
- File-upload routes (`upload`, `gpx`) are multipart — use curl with `-F` for those two.

## Debugging tips

- Local route errors: run `npm run dev` and watch the terminal; all routes are SSR (`prerender=false`).
- A 401 on a cron route means token mismatch — check which env var the route wants in `references/api-endpoints.md`.
- `{ ok: true, mock: true }` responses mean the server has no Supabase admin client (missing `SUPABASE_SECRET_KEY`) — expected in some local setups.
