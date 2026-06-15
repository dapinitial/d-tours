# D-Tours → Multi-User Product Pivot — Kickoff Brief

**Date:** 2026-06-15
**Purpose:** Hand-off brief so a fresh session can start building the multi-user pivot
without re-discovering context. This is a strategy brief, **not** a spec — the first
step is to brainstorm the front-door + privacy spec (see "Start here").

## The vision

Turn D-Tours from a single hand-provisioned trip into an **open, multi-user product**:
anyone signs up, builds their own trip (Seattle/WA/PNW and beyond), Shotgun auto-seeds
the day-dossiers, and people can join — climbing OR general road-tripping. Triggered by
the FIFA World Cup 2026 in Seattle (a wave of road-trippers asking "what do I do?").
This realizes the documented coordination-vision + crew-self-declare arc.

## Current state (what's shipped / reusable — ~40% there)

- **Multi-tenant data model + RLS** (tenants, `tenant_id` scoping on every table).
- **Supabase Auth** (magic-link login, callback, signout) — but **gated to owners**:
  `middleware.ts` only sets `locals.tenantId` for `/cms/*` when `crew.is_owner = true`.
- **Chapters + day-level calendar** (shipped) — see
  `docs/superpowers/specs/2026-06-14-trip-chapters-calendar-design.md`.
- **Smart Commit** (shipped) — beta→smart-date→calendar; see
  `docs/superpowers/specs/2026-06-15-smart-commit-design.md`.
- **Itinerary/calendar/map/detour engine, journal, caravan signups** (climb/ride),
  crew-self-declare rails, Shotgun chat + research/auto-seed (climbing-tuned).
- Infra: DigitalOcean App Platform, **single `apps-s-1vcpu-0.5gb` instance, count 1**,
  deploy-on-push from `main`. Supabase project `pucyvfwrosinnbgkremb` (shotgundetour).

## The other ~60% — five workstreams

1. **🚪 Front door — self-serve accounts (the unlock).** Public signup → auto-create
   user + their tenant + their owner `crew` row in one transaction. Email verify +
   password recovery (Supabase Auth gives most of this; it's just gated off today).
   "Create your first trip" flow + a clonable **Seattle/PNW template**.
2. **🔒 Multi-tenant privacy redesign (highest-stakes — do NOT ship #1 without it).**
   RLS is currently `using(true)` → **every trip is world-readable**. Correct for one
   public trip; a **data leak for many**. Need private-by-default trips, an explicit
   "share my plan" toggle, and an audit that an owner can only ever touch their own
   tenant. A bug here = cross-tenant read/write.
3. **🌲 Generalize beyond climbing.** "Objective + climbing beta" → "any day-activity +
   dossier." Auto-seed research is climbing-tuned (Mountain Project/SummitPost) — needs
   generalizing to breweries/museums/match-day/non-technical hikes. Caravan
   "join climb/ride" → "join activity." Detour-relevance engine is climber-tuned and
   needs generic-traveler tuning.
4. **⚙️ Infra & guardrails.** CDN/edge cache on public reads (big, easy win), **rate
   limits on every public endpoint** (signup/chat/comments/suggestions), Supabase plan
   bump + pooling, error/uptime monitoring. (Today: no caching, no rate limiting.)
5. **💳 Payments & the business.** Stripe; a $5–10 gate or subscription; entitlements
   (free vs paid — e.g. Shotgun chat behind the gate); receipts/refunds; ToS, privacy
   policy, support, "delete my data."

## Recommended sequencing — three releases (validate at each gate)

1. **Private beta** → #1 + #2 + Seattle template + basic rate limits. Invite a small,
   known group. Proves the multi-user core *safely*.
2. **Open + monetize** → #5 (payments) + #4 (caching/scale). Strangers can pay + pile in.
3. **Broaden** → #3 (generalize past climbing) once you see what people build.

## Landmines / facts to remember (don't re-derive)

- **RLS `using(true)`** on stops/objectives/etc. = world-readable. The keystone risk for
  multi-user. #1 and #2 are **inseparable** — spec them together.
- **Anthropic / Shotgun chat is NOT wired in prod** — `ANTHROPIC_API_KEY` is unset, so
  `/api/chat` returns a graceful "not wired up" message. **No LLM spend/abuse today.** The
  cost/abuse risk only *arms* when the key is set → add rate-limit + daily cap BEFORE
  wiring it. (Uses the paid Anthropic API, Haiku default — there is no "local" option.)
- **Owner auth is DB-driven** (`crew.is_owner`), not a hardcoded email. The one email in
  source (`ReachUs.astro`, `['me','davidpuerto.com'].join('@')`) is a weak anti-scraper
  split for the public *contact* address — defeated by any JS-rendering scraper. Real fix
  if wanted: a server-relayed contact form (SMTP_* already wired).
- Monetization options weighed: **BYOK** = power-user only (≈99% of travelers have no
  Anthropic key) — not a mass model. **$5–10 gate + owner's rate-limited Haiku** = viable,
  pulls in payments. **Free + rate-limited** = simplest, you fund it.
- Infra won't take a crowd as-is (single 0.5GB box, no cache/limits).

## Start here (next session)

Run the **brainstorming** skill to lock ONE spec covering the **front door + privacy
redesign together** (workstreams #1 + #2 — they're one safe unit). Then `writing-plans`
isn't installed here, so carry the build as sliced commits (the pattern used for chapters
+ Smart Commit: small slices, `npm test` for pure libs, `astro build` to verify, commit
per slice, deploy from `main`). Optionally sketch the Seattle/PNW clonable template first
so the beta has something concrete to start from.
