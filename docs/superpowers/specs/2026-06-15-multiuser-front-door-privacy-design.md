# D-Tours Multi-User Pivot — Front Door + Privacy + Intent Layer — Design

**Date:** 2026-06-15
**Status:** Approved (design); ready for implementation plan
**Author:** David + Shotgun
**Builds on:** `docs/PRODUCT-PIVOT-multiuser.md` (kickoff brief), `docs/superpowers/specs/2026-06-14-trip-chapters-calendar-design.md` (chapters/calendar, shipped), `docs/superpowers/specs/2026-06-15-smart-commit-design.md` (Smart Commit, shipped)

## Problem

D-Tours is a mature single-trip product. Auth, multi-tenant columns, and a rich
dossier engine exist — but the trip is **hand-provisioned** and **RLS is `using(true)`**,
so every trip is world-readable. That's correct for one public trip and a **data leak**
for many. To open D-Tours to self-serve multi-user trips (triggered by FIFA World Cup
2026 in Seattle), the **front door** (self-serve signup) and the **privacy redesign**
(private-by-default + share toggle) must ship together — one is unsafe without the other.

Additionally, the dossier engine is climbing-tuned (hardcoded GEAR / SKILLS / ROUTES
labels). A roadtripper, a skydiver, a SCUBA diver, a mountain biker should each get a
dossier shaped to *their* activity (PACKING LIST, DROP ZONES, DIVE LOG…) — not climbing's.

## Goal

One safe multi-user core, shipped as a private beta:

1. **Front door** — public signup auto-creates user + their tenant + their owner `crew`
   row in one atomic transaction; lands on a populated trip cloned from a Seattle/PNW
   template; passwordless (magic-link) so email-verify is free and there are no passwords
   to recover.
2. **Privacy redesign** — private-by-default trips; an explicit "share my plan" toggle;
   a cross-tenant write audit proving an owner can only ever touch their own tenant.
3. **Intent / section-schema layer** — each trip declares a free-text *intent*; its
   dossier renders from a data-driven, **owner-editable** `section_schema` (first-drafted
   by Sonnet, with a generic never-break fallback). Climbing's GEAR/SKILLS and a
   roadtrip's PACKING LIST are the same renderer over different data.

## Non-goals (explicitly deferred)

- **Payments / entitlements** (workstream #5) — later release.
- **CDN / edge caching, Supabase plan bump, pooling** (workstream #4 scale work) — later.
- **Generalizing Shotgun's auto-seed *research*** (Mountain Project/SummitPost → breweries/
  match-day) (workstream #3) — this spec generalizes the dossier *schema/labels*, not the
  research prompts. A non-climbing trip gets the right *sections* now; rich auto-filled
  *content* for non-climbing activities comes later.
- **Classic email+password** — trimmed in favor of magic-link (see §E). Reintroduce only
  if a future release needs it.

## Showcase framing (product decision)

David's (climbing) and Derek's (roadtrip) trips stay `visibility='public'` and remain the
**home-page showcase** — the live, explorable demo of the product. Derek is the canonical
*roadtrip* example sitting next to David's *climbing* example, so the landing page itself
proves the promise: **"We're a climbing trip — but you can be whatever you want. Look at
Derek, he's just road-tripping."** New signups are private-by-default; the flagship trips
are simply opted-in to public.

## Verified current state (confirmed in code 2026-06-15)

- **Middleware gate** (`src/middleware.ts`): sets `locals.tenantId` for `/cms/*` only when
  a `crew` row matches `user.email` with `is_owner=true`. Everything else is public.
- **Auth** (`src/pages/login.astro`, `src/pages/auth/callback.ts`, `auth/signout.ts`):
  Supabase **magic-link OTP** (`signInWithOtp`, redirect `/auth/callback`). No passwords.
- **`crew`** (`supabase/migrations/0001_init.sql`, `0029_crew_role.sql`): `email` PK,
  `display_name`, `is_owner`, `role ('owner'|'driver'|'passenger')`, plus a live-DB-only
  `tenant_id`. **No link to `auth.users` / `auth.uid()`.**
- **`tenants`** (live DB only, not in repo migrations): `id`, `slug`, `name`, `tagline`,
  `interests[]`, `is_default`. Resolved via `getDefaultTenant()` / `getTenantBySlug()`.
- **RLS `using(true)`** read policies on `objectives`, `resources`, `gear`, `sources`,
  `rig`, `chapters` (and status-gated public reads on `stops`, `posts`, `comments`,
  `rendezvous`, `signups`, `playlist_suggestions`). All world-readable.
- **Dossier rendering** (`src/pages/objectives/[id].astro`, `stops/[id].astro`): section
  labels (`🎒 Gear & food`, `🪢 Skills needed`, …) are **hardcoded JSX**. `objectives.beta`
  (jsonb) holds the content; `stops/[id].astro` uses a `sections` array pattern already.
- **`gear` / `skills`**: tenant-scoped tables; categories + entries are **user data**
  (already user-addable), grouped dynamically in `gear.astro` / `skills.astro`.
- **Caravan signup** (`src/pages/api/signup.ts`, `objectives/[id].astro`): the existing
  public self-declaration pattern (anon insert → owner moderates). Template for join flows.
- **Email** (`src/lib/notifier/email.ts`): Resend (HTTP) primary, SMTP fallback; logs to
  console when unconfigured.
- **No rate limiting anywhere.** **`ANTHROPIC_API_KEY` unset in prod** (`/api/chat`
  returns a graceful "not wired up").
- **Stack:** Astro 5 SSR (`output:'server'`, node adapter, `checkOrigin:false`).
  `@supabase/ssr` per-request client (`supabaseServer.ts`, RLS-bound) + service-role admin
  client (`supabase.ts`, never shipped to browser).

---

## Part 1 — Data model + privacy (the keystone)

### A. Visibility on the tenant
```
tenants.visibility  text  not null  default 'private'  check (visibility in ('private','public'))
```
David's + Derek's rows → `'public'`. Everything new → `'private'`. The "share my plan"
toggle flips this one column.

### B. Auth ↔ tenant linkage (the missing join)
```
crew.auth_user_id  uuid  references auth.users(id)
crew.can_write     boolean  not null  default true     -- owner/driver vs read-only passenger
-- relax PK: surrogate id (uuid pk) + unique(tenant_id, email); keep email for display/invite
```
One `STABLE SECURITY DEFINER` helper, used by every policy (function, not inline subquery,
to avoid recursive-RLS and keep policies fast/readable):
```sql
create function current_tenant_ids() returns setof uuid
  language sql stable security definer set search_path = public as $$
    select tenant_id from crew where auth_user_id = auth.uid();
$$;
```

### C. RLS rewrite — `using(true)` → membership-or-public
Tenant-scoped **read** policies become:
```sql
using ( tenant_id in (select current_tenant_ids())
        or tenant_id in (select id from tenants where visibility = 'public') )
```
**Write** (insert/update/delete) policies drop the public branch and require write access:
```sql
using      ( tenant_id in (select tenant_id from crew where auth_user_id = auth.uid() and can_write) )
with check ( tenant_id in (select tenant_id from crew where auth_user_id = auth.uid() and can_write) )
```
- `crew` gets its own RLS so a user reads only their own membership rows.
- Existing **anon-insert** policies (subscribers, suggestions, comments, signups,
  playlist_suggestions) are preserved unchanged — public still suggests/joins/comments.
- Status-gated public reads (e.g. `stops.status != 'declined'`) keep their status clause
  **AND** gain the membership-or-public tenant clause.
- Tables missing a real `tenant_id` column in committed migrations get it added + backfilled
  to David's tenant before their policies are rewritten (audit confirms every user-data table
  is tenant-scoped first).

### D. Cross-tenant write audit (shipped artifact)
A scripted integration test that mints two JWTs — user A in tenant A, user B in tenant B,
plus an anon client — and asserts, for **every** tenant-scoped table:
- A can read/write A's rows; A **cannot** select / insert / update / delete B's rows.
- Anon can read **public** trips and **cannot** read private trips.
- Anon-insert tables still accept anon inserts (no regression).

This is the gate: **nothing user-facing ships until this passes.** It's also the permanent
regression net for future tables.

---

## Part 2 — Front door + intent/section-schema layer

### E. Auth model — passwordless magic-link (scope trim)
Signup = enter email → magic link → in. Magic-link gives **email verification for free** and
means **no passwords to store, no recovery flow to build**. Reuses the existing
`signInWithOtp` machinery; we ungate it for non-owners.

### F. Signup → auto-provision (one atomic RPC)
New `/signup` page. After the magic link verifies a **new** user, the app calls one
`SECURITY DEFINER` RPC `provision_trip(intent_text, trip_name)` that, in a single
transaction:
1. inserts `tenants` (`visibility='private'`, generated unique slug, stores `intent_text`),
2. inserts the owner `crew` row (`auth_user_id = auth.uid()`, `is_owner=true`, `can_write=true`),
3. **clones the template** trip's chapters/stops/objectives into the new tenant (§I),
4. stamps the **section_schema** (generic fallback initially; §G).

Atomic = no half-provisioned accounts. The middleware owner-gate works unchanged because the
new crew row satisfies it. Provisioning is idempotent-guarded (a user who already owns a
trip is routed to it rather than re-provisioned).

### G. Intent + section_schema — agent-generated, owner-editable, fallback-safe
```
tenants.intent_text     text          -- free-text: "BBQ crawl through Texas", "SCUBA the Keys"
tenants.section_schema  jsonb         -- the dossier layout for THIS trip
```
Schema shape (data-driven; replaces hardcoded dossier JSX):
```jsonc
{ "sections": [
    { "key": "packing", "label": "Packing List", "icon": "🎒", "fields": ["essentials","layers","docs"] },
    { "key": "eats",    "label": "Eats & Fuel",  "icon": "🍔", "fields": ["food","gas"] }
] }
```
Three composable layers, all writing the **same column**:
1. **Generic fallback** — stamped by `provision_trip` synchronously: Activity · Packing ·
   Eats · Stops · Notes. Guarantees onboarding **never hard-fails** even with
   `ANTHROPIC_API_KEY` unset.
2. **Sonnet first-draft** — runs **async after provision**; reads `intent_text`, emits a
   tailored `section_schema`, upgrades the row in place. One-shot per trip (regenerate only
   on explicit intent change). Sonnet (not Haiku) because it's a one-time reasoning task with
   bounded cost; live Shotgun chat stays on Haiku.
3. **Owner edits** — the schema is **editable in the CMS**: rename / reorder / add / remove
   sections and fields. Sonnet's draft is a starting point, never a lock. Sonnet can also
   extend on request ("add a dive-certifications section").

**Dossier rendering** (`objectives/[id].astro`, `stops/[id].astro`) stops hardcoding labels
and **renders from `section_schema`**. David's tenant carries the climbing schema; Derek's
the roadtrip schema — same renderer, different data.

**User-addable contents (always on):** `gear`, `skills`, and per-section items remain
tenant-scoped, user-editable lists. A skydiver adds "Wingsuit / Pilot chute"; a SCUBA diver
adds "BCD / Regulator / Dive computer"; a mountain biker swaps SKILLS → "Trail Skills" and
adds a "Bike Setup" section. Nothing about a trip's shape is frozen at creation.

### H. Shotgun research stays climbing-tuned (known edge)
Auto-seed *research* prompts remain climbing-tuned this release. A non-climbing trip gets the
right *sections* now; rich auto-filled *content* is the deferred generalization (non-goals).

---

## Part 3 — Template + rate limits + showcase

### I. Seattle/PNW clonable template
A real tenant flagged `is_template = true` (hidden from public listings), seeded once with a
Seattle / World-Cup skeleton: chapters (Arrive · Match Days · PNW Loop), a handful of stops
(Seattle, Cascades, coast), a couple of generic day-dossiers. `provision_trip` deep-copies
template rows into the new tenant via parameterized `INSERT … SELECT` per table, remapping
ids + `tenant_id`, inside the provisioning transaction. New users land on a populated trip,
not a blank map.

### J. Basic rate limits
`src/lib/ratelimit.ts` — in-memory token bucket keyed by IP, applied to public-write
endpoints: `/signup`, `/api/chat`, `/api/comments`, `/api/signup`, `/api/suggestions`. Plus a
**daily global cap on `/api/chat`** — the cap that **must** exist before `ANTHROPIC_API_KEY`
is ever set. Single-instance in-memory is honest for the current 1-box deploy; it resets on
redeploy and graduates to Redis/Upstash when scaling past one instance (not now — YAGNI).

### K. Home-page showcase
Keep the David + Derek detour map where it is — now explicitly the product demo. Add the
framing line ("We're a climbing trip — but you can be whatever you want. Look at Derek, he's
just road-tripping.") and a **Start your own trip → /signup** CTA. Both flagship tenants get
`visibility='public'`; the home page reads them exactly as today. Mostly copy + CTA + two
visibility flips.

---

## Components & boundaries

| Unit | Responsibility | Depends on |
|---|---|---|
| `provision_trip(intent_text, trip_name)` RPC | Atomic create tenant + owner crew + clone template + stamp fallback schema | `tenants`, `crew`, template tenant |
| `current_tenant_ids()` fn | Map `auth.uid()` → owned/joined tenant_ids for RLS | `crew.auth_user_id` |
| RLS policy set | Private-by-default reads (membership-or-public); write = membership+can_write | helper fn, `tenants.visibility` |
| cross-tenant audit script | Prove isolation across every tenant-scoped table | two JWTs + anon client |
| `/signup` page + onboarding | Magic-link signup → name+describe trip → call RPC | auth, RPC |
| section_schema renderer | Render dossiers from `tenants.section_schema` | `section_schema` shape |
| Sonnet schema generator | intent_text → section_schema (async upgrade) | Anthropic API (optional), fallback |
| `ratelimit.ts` | Per-IP token bucket + chat daily cap | — |

## Error handling

- **No Anthropic key / Sonnet error** → generic fallback `section_schema` already stamped;
  trip is fully usable; upgrade retried on next intent edit.
- **Provision failure** → transaction rolls back; no half-created account; user sees a retry.
- **Rate-limit hit** → 429 with a friendly message; never a crash.
- **RLS denial** → empty result / insert rejected; the audit script is what proves this.

## Testing

- **Pure libs** (`ratelimit.ts`, section_schema validation/merge) → `npm test`.
- **Cross-tenant write audit** (§D) → scripted, run before deploy; the safety gate.
- **`astro build`** to verify each slice compiles.
- Manual: signup → land on cloned template → flip share → confirm public/private reads.

## Commit slicing (chapters / Smart Commit pattern)

1. **Migration: schema + RLS core** — `tenants.visibility` / `intent_text` /
   `section_schema` / `is_template`; `crew.auth_user_id` / `can_write` + PK relax;
   `current_tenant_ids()`; backfill missing `tenant_id`s; flip flagship tenants `public`.
2. **RLS rewrite** — replace every `using(true)` with membership-or-public; add write
   policies; `crew` self-read policy; preserve anon-insert policies.
3. **Cross-tenant write audit** — two-JWT + anon integration script (proves 1–2 before
   anything builds on them).
4. **`provision_trip` RPC + template tenant seed** — atomic create + clone + fallback schema.
5. **Signup front door** — `/signup` page, ungate auth, onboarding (name + describe), call RPC.
6. **section_schema rendering** — dossier pages read `section_schema`; backfill David=climbing /
   Derek=roadtrip schemas.
7. **Sonnet schema generation** — async intent→schema, in-place upgrade over fallback + CMS edit.
8. **Rate limits** — `ratelimit.ts` + apply to public-write endpoints + chat daily cap.
9. **Home-page showcase** — framing copy + CTA.

Slices 1–3 are the safety spine and land first. **Nothing user-facing ships until the audit
(3) passes.**
