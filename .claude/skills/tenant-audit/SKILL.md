---
name: tenant-audit
description: This skill should be used to verify multi-tenant safety after any change to RLS policies, migrations, provisioning, or crew/auth flows. Runs the cross-tenant isolation audit, the provision_trip smoke test, and the link_my_crew co-owner test against the live Supabase project. Use when asked to "audit tenants", "check RLS", "verify isolation", or after touching supabase/migrations.
---

# Tenant Audit

Three self-cleaning scripts prove the multi-tenant safety rails against the real Supabase project (ref `pucyvfwrosinnbgkremb`). Each provisions throwaway users/tenants tagged `audit-*`/`prov-*`/`link-*`, runs its checks, tears everything down, and exits non-zero on any failure.

## When to run what

| Change you just made | Run |
|---|---|
| Any migration touching RLS, policies, `current_tenant_ids()`, or grants | `npm run audit:tenants` (always) |
| `provision_trip` RPC, template tenant, onboarding | `node scripts/test-provision.mjs` |
| `link_my_crew`, crew table, auth/sign-in flow | `node scripts/test-link-crew.mjs` |
| Anything auth/tenant-adjacent before a deploy | all three |

## Prerequisites

All three read `.env` at the repo root via `process.loadEnvFile('.env')`:

- `PUBLIC_SUPABASE_URL`
- `PUBLIC_SUPABASE_PUBLISHABLE_KEY` (anon)
- `SUPABASE_SECRET_KEY` (service role — admin create/delete of throwaway users)

They run against **production** Supabase (there is no local stack). Safe by design: throwaway users use `@audit.local` emails, all rows are tagged and deleted in `finally` blocks.

## The scripts

### `npm run audit:tenants` — cross-tenant isolation (scripts/audit-tenant-isolation.mjs)
Provisions users A and B each with a private tenant + objectives/stops/gear, then verifies as A, B, and anon: owners read their own rows, cannot read each other's, anon reads only the public tenant. Proves the private-by-default RLS from migration `0032_multiuser_rls.sql`.

**Caveat:** expects the public tenant with slug `david` to exist (it anchors the public-read checks).

### `node scripts/test-provision.mjs` — provisioning smoke
Calls `provision_trip` RPC as a fresh user both ways: scratch default (1 starter chapter, 0 stops/objectives, private, `location_sharing='approximate'`, fallback `section_schema` stamped) and `p_from_template: true` (3 chapters, 5 stops, 2 objectives cloned). Covers migrations `0034`/`0038`.

### `node scripts/test-link-crew.mjs` — co-owner claim
Simulates a pre-invited crew row (`auth_user_id` null, like Ryan/Derek) and verifies: no access before `link_my_crew()`, linked and reading their private trip after. Covers migration `0035`.

## Reading results

Each check prints ✅/❌ and the run ends with `N/M passed`; exit code 0 only on all-pass. On failure, the ❌ line names the exact invariant broken — treat any failure as a release blocker, since these invariants are what keep one tenant's trip invisible to another.

If a run dies mid-way (network, ctrl-C), teardown may be incomplete: look for leftover `tenants` rows with slugs prefixed `audit-`/`prov-`/`link-` and auth users at `@audit.local`, and delete them with the service-role client.
