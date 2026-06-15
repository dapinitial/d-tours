# D-Tours Multi-User Pivot — Implementation Plan

**Date:** 2026-06-15
**Spec:** `docs/superpowers/specs/2026-06-15-multiuser-front-door-privacy-design.md`
**Pattern:** small slices, one commit each; `npm test` for pure libs, `astro build` to verify
each slice compiles, cross-tenant audit gates the user-facing work. Migrations land on a
**Supabase branch** first (project `pucyvfwrosinnbgkremb`), verified, then merged to prod.

## Ground truth (verified live 2026-06-15)

- **18 tables carry `tenant_id`:** chapters, comments, companions, gear, objectives,
  playlist_suggestions, posts, proximity_log, rendezvous, resources, rig, signups, skills,
  sources, stops, subscribers, suggestions — plus **crew** (the membership table itself).
- **Live RLS = SELECT-only**, all permissive: `using(true)` on objectives, resources, gear,
  sources, rig, chapters, companions, skills, tenants; status-gated on stops, posts,
  comments, rendezvous, signups, playlist_suggestions; `crew` already self-reads on email.
  **No insert/update/delete policies exist** → all writes go through the service-role admin
  client today.
- **Clients:** `getSupabase()` session-less anon (public reads, RLS-bound), `supabaseServer()`
  per-request cookie client (auth checks only today), `getSupabaseAdmin()` service-role
  (writes + CMS reads, bypasses RLS).
- **Decision: Full RLS** — route owner reads/writes through `supabaseServer`; admin client
  reserved for crons + the provision RPC.

## Safety protocol for slices 1–4

1. Create a Supabase **branch** (`mcp__supabase__create_branch`) — never test RLS on prod.
2. Apply migrations + run the audit on the branch.
3. Only after the audit is green and `astro build` passes against the branch, **merge** the
   branch and commit the migration files to the repo.
4. Keep a one-line rollback note per migration (drop policy / restore `using(true)`).

---

## Slice 1 — Schema core (migration only, RLS untouched)

**Goal:** add every column/function the privacy model needs, backfill, and flag flagship
tenants public — but leave read policies as-is so nothing goes dark mid-flight.

**Migration `0031_multiuser_schema.sql`:**
```sql
-- tenants: visibility, intent, schema, template flag
alter table tenants add column if not exists visibility text not null default 'private'
  check (visibility in ('private','public'));
alter table tenants add column if not exists intent_text text;
alter table tenants add column if not exists section_schema jsonb;
alter table tenants add column if not exists is_template boolean not null default false;

-- crew: real auth linkage + write capability; relax email PK -> surrogate id
alter table crew add column if not exists id uuid not null default gen_random_uuid();
alter table crew add column if not exists auth_user_id uuid references auth.users(id);
alter table crew add column if not exists can_write boolean not null default true;
-- (PK relax handled carefully: add unique(tenant_id,email), then swap PK to id)

-- membership lookup used by every policy
create or replace function current_tenant_ids() returns setof uuid
  language sql stable security definer set search_path = public as $$
    select tenant_id from crew where auth_user_id = auth.uid();
$$;

-- write-capable membership (used by write policies)
create or replace function current_writable_tenant_ids() returns setof uuid
  language sql stable security definer set search_path = public as $$
    select tenant_id from crew where auth_user_id = auth.uid() and can_write;
$$;

-- flag flagship tenants public (David + Derek) — inert until slice 2 rewrites RLS
update tenants set visibility = 'public' where is_default = true or slug = 'derek';
```
- **Backfill `crew.auth_user_id`:** match existing crew rows to `auth.users` by email
  (`update crew c set auth_user_id = u.id from auth.users u where u.email = c.email`).
- **Verify:** `mcp__supabase__list_tables` shows new columns; `select visibility,slug from
  tenants` shows the two flagship rows `public`; `current_tenant_ids()` executes.
- **Commit:** `feat(multiuser): schema core — tenant visibility/intent/schema, crew auth link, membership fns`

---

## Slice 2 — RLS rewrite (the flip)

**Goal:** private-by-default reads, write policies that bite, anon-insert where public writes
are legitimate. Applied on the branch; verified by slice 4 before merge.

**Migration `0032_multiuser_rls.sql`** — for each of the 18 tenant-scoped tables:
```sql
-- READ: member-or-public (keep any existing status clause AND it)
drop policy if exists "<old read>" on <t>;
create policy "<t> read" on <t> for select using (
  tenant_id in (select current_tenant_ids())
  or tenant_id in (select id from tenants where visibility = 'public')
  -- AND (<existing status clause, e.g. status <> 'declined'>) where one existed
);
-- WRITE: writable member only
create policy "<t> write" on <t> for all
  using      (tenant_id in (select current_writable_tenant_ids()))
  with check (tenant_id in (select current_writable_tenant_ids()));
```
Special cases:
- **tenants:** `select using (visibility = 'public' or id in (select current_tenant_ids()))`
  — stops private trip names/slugs leaking via `listTenants`/`getTenantBySlug`.
- **crew:** self-read by `auth_user_id = auth.uid()` (and keep email match for transition);
  write only by an owner of the same tenant.
- **Public-insert tables** (subscribers, suggestions, playlist_suggestions, comments,
  signups): add explicit `for insert with check (true)` (or a tenant-bound check) so the
  public endpoints work through the anon session client after slice 3.
- **Status-gated reads** (stops/posts/comments/rendezvous/signups/playlist_suggestions):
  preserve the status clause, AND it with the member-or-public clause.

**Rollback note per table:** `create policy ... using(true)` restores prior behavior.
**Verify (on branch):** anon `select * from objectives` returns only public-tenant rows;
`astro build` green. Full proof is slice 4.
**Commit:** `feat(multiuser): private-by-default RLS — member-or-public reads, can_write writes, anon-insert policies`

---

## Slice 3 — Data-layer + endpoint refactor to the session client (Full RLS)

**Goal:** make `auth.uid()` real on every owner request so slice 2's policies enforce instead
of locking the CMS out.

- **`data.ts`:** give read functions access to the per-request client. Lowest-churn shape: a
  `createDb(client)` factory (or an optional first-arg `client` defaulting to `getSupabase()`)
  so call sites pass `supabaseServer(cookies, headers)`. Public pages pass the same client
  with no session (anon → RLS public-only); CMS pages pass it with the owner cookie
  (auth.uid() → member rows).
- **Middleware:** construct the request client once, stash on `ctx.locals.sb`, so pages/routes
  reuse it (already builds one for the owner check — reuse it).
- **Write endpoints** (`/api/itinerary`, `/api/objectives`, CMS mutations, etc.): swap
  `getSupabaseAdmin()` → the request session client so writes go through RLS with the owner
  JWT. `requireOwner` already authenticates via `supabaseServer`.
- **Public-write endpoints** (`/api/signup`, `/api/comments`, subscribe, suggestions): move
  to the anon session client (covered by slice 2 anon-insert policies).
- **Keep on admin client:** cron/automation paths with no user (watcher, weather, digest) and
  the `provision_trip` RPC context only.
- **Verify:** `astro build`; manually load a CMS page as owner (sees own data), a public page
  as anon (sees public only).
- **Commit:** `refactor(multiuser): route owner reads/writes through RLS session client; admin reserved for crons`

---

## Slice 4 — Cross-tenant write audit (the gate)

**Goal:** prove isolation before any user-facing work; permanent regression net.

- **`scripts/audit-tenant-isolation.mjs`:** mint two user JWTs (user A → tenant A, user B →
  tenant B) via the admin client + an anon client. For **every** tenant-scoped table assert:
  - A reads/writes A's rows; A **cannot** select/insert/update/delete B's rows.
  - anon reads **public** trips, **cannot** read private trips.
  - anon-insert tables still accept anon inserts (no regression).
- Add `npm run audit:tenants`. Run against the branch.
- **Gate:** must be fully green before merging the branch to prod. If red, fix slice 2/3, rerun.
- **Commit:** `test(multiuser): cross-tenant isolation audit across all tenant-scoped tables`
- **Then:** merge the Supabase branch → prod; commit migration files `0031`/`0032`.

---

## Slice 5 — `provision_trip` RPC + template tenant

**Goal:** one atomic signup→trip transaction landing on a populated template.

- **Template seed migration `0033_template_tenant.sql`:** insert a tenant `is_template=true`,
  `visibility='private'`, with a Seattle/World-Cup skeleton — a few chapters (Arrive · Match
  Days · PNW Loop), a handful of stops (Seattle, Cascades, coast), 1–2 generic day-dossiers.
- **`provision_trip(intent_text text, trip_name text)` SECURITY DEFINER RPC:**
  1. insert tenant (private, generated unique slug, store `intent_text`),
  2. insert owner crew row (`auth_user_id = auth.uid()`, `is_owner=true`, `can_write=true`),
  3. clone template chapters/stops/objectives via `insert … select` per table, remapping
     ids + `tenant_id`,
  4. stamp the **generic fallback** `section_schema` (Activity · Packing · Eats · Stops · Notes),
  5. return the new tenant id/slug. Idempotent-guard: if the caller already owns a trip, return it.
- **Verify:** call the RPC as a test user → new tenant + crew + cloned rows; audit (slice 4)
  still green with the new tenant.
- **Commit:** `feat(multiuser): provision_trip RPC + Seattle/PNW template tenant`

---

## Slice 6 — Signup front door

- **`/signup.astro`:** email entry → magic link (reuse `signInWithOtp`), ungate non-owners.
- **Onboarding step** (post-verify, new user): "name your trip + describe it in a sentence" →
  call `provision_trip` → redirect to the new trip's CMS.
- **Middleware:** allow authenticated non-owners through onboarding; existing owner-gate on
  `/cms/*` unchanged (the new crew row satisfies it).
- **Verify:** fresh email → link → onboarding → lands on cloned trip.
- **Commit:** `feat(multiuser): self-serve signup + onboarding -> provision_trip`

---

## Slice 7 — section_schema rendering

- **Renderer:** `objectives/[id].astro` + `stops/[id].astro` read `tenant.section_schema`
  instead of hardcoded labels; a small `<DossierSections schema=… data=…>` helper maps
  `{key,label,icon,fields}` → existing field rendering.
- **CMS editor:** owner can rename/reorder/add/remove sections + fields (writes `section_schema`).
- **Backfill:** stamp David = climbing schema (current labels), Derek = roadtrip schema
  (PACKING LIST · FUEL · EATS · STOPS).
- **Verify:** David's dossier looks unchanged; Derek's shows roadtrip sections; `astro build`.
- **Commit:** `feat(multiuser): data-driven dossier sections from tenant.section_schema`

---

## Slice 8 — Sonnet schema generation

- **`src/lib/intentSchema.ts`:** `generateSectionSchema(intent_text)` → calls Anthropic
  **Sonnet**, validates the JSON shape, returns it; pure-ish (mock when key unset).
- **Async upgrade:** after `provision_trip`, a server task generates the schema and updates
  the tenant in place over the fallback. Regenerate on explicit intent edit only.
- **Tests:** `npm test` for schema validation + merge (fallback ← draft ← owner edits).
- **Commit:** `feat(multiuser): Sonnet intent->section_schema with fallback + in-place upgrade`

---

## Slice 9 — Rate limits

- **`src/lib/ratelimit.ts`:** in-memory token bucket keyed by IP; `npm test` covers it.
- Apply to `/signup`, `/api/chat`, `/api/comments`, `/api/signup`, `/api/suggestions`; add a
  **daily global cap on `/api/chat`** (must exist before `ANTHROPIC_API_KEY` is ever set).
- **Commit:** `feat(multiuser): in-memory rate limits on public endpoints + chat daily cap`

---

## Slice 10 — Home-page showcase

- Keep the David + Derek detour map; add framing line ("We're a climbing trip — but you can
  be whatever you want. Look at Derek, he's just road-tripping.") + **Start your own trip →
  /signup** CTA.
- **Commit:** `feat(multiuser): home-page showcase framing + signup CTA`

---

## Sequencing & gates

- **Branch-first:** slices 1–4 on a Supabase branch; merge only after the audit is green.
- **Hard gate:** no user-facing slice (5+) ships until slice 4 passes.
- **Deferred (separate specs):** payments/entitlements, CDN/edge cache + plan bump,
  generalizing Shotgun's *research* prompts beyond climbing, classic email+password.
