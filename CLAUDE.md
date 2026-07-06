# Shotgun Detour — dev guide

Multi-tenant road-trip platform at **shotgundetour.com**: visitor site + CMS + live location + the Shotgun trip co-pilot. Astro SSR (`output: 'server'`, `@astrojs/node` standalone) + Supabase (auth, Postgres w/ RLS, project ref `pucyvfwrosinnbgkremb`).

Naming drift: the repo/package are still named `d-tours` (`dapinitial/d-tours`), the live DO app is `shotgundetour-app`, and `.do/app.yaml` stale-ly says `d-tours`; the product is shotgundetour.com. Don't "fix" this in passing — deploy config depends on it (details in the deployment-status skill).

## Commands

- `npm run dev` — dev server (localhost:4321)
- `npm run build` / `npm start` — build, serve `dist/server/entry.mjs`
- `npm test` — unit tests (`src/**/*.test.ts`, node test runner)
- `npm run audit:tenants` — cross-tenant RLS audit (see tenant-audit skill)
- `npm run mapshare` / `npm run digest` / `npm run dtours` — feed poll, digest compose, OSM corridor scout

## Layout

- `src/pages/api/` — ~33 SSR API routes (tenant, geo/MapShare, token-gated cron, LLM, CMS content)
- `src/lib/` — data access, proximity/weather/notifier helpers
- `supabase/migrations/` — schema source of truth (38+; RLS in `0032`, provisioning `0034`/`0038`, settings `0037`)
- `scripts/` — operational scripts (audits, feed polling, digest)
- `bin/` — `shotgun-brief.mjs` headless morning brief (launchd)
- `shotgun/` — the **runtime trip co-pilot agent** (own CLAUDE.md persona, run as its own `claude` session). Not dev tooling; don't load its conventions here.
- `.claude/skills/` — project dev skills (tenant-audit, api-client, deployment-status, mapshare-debug, climbing-data)
- `.agents/skills/` — external skills pinned by `skills-lock.json`; don't hand-edit

## Conventions & guardrails

- Commits: small slices, `feat(scope): slice N — summary` style (see `git log`).
- All tenant-scoped tables carry `tenant_id`; RLS is private-by-default. After touching migrations/RLS/provisioning, run the **tenant-audit** skill scripts.
- Cron endpoints (`/api/watch`, `/api/refresh-conditions`, `/api/digest`) are token-gated via `WATCH_TOKEN`/`DIGEST_TOKEN` (Bearer or `?token=`), hit by Supabase pg_cron.
- Secrets live in `.env` (loaded by scripts via `process.loadEnvFile`); never commit. `.envrc` pins the Supabase CLI to this account via keychain PAT.
- External data policy: free/open sources only in product code (Open-Meteo, OSM Overpass, OpenBeta, avalanche.org, PAD-US). The anonymous Mountain Project API is **dev-time research only — never imported by product code** (see climbing-data skill).

## Deploy

Push to `main` → auto-deploy to DigitalOcean App Platform (app `shotgundetour-app`; `.do/app.yaml` is a stale spec, single basic-xxs, port 8080). Use the **deployment-status** skill to answer "is commit X live?". Secrets are set as encrypted envs in the DO dashboard, not in the spec.
