---
name: deployment-status
description: This skill should be used to answer "is this deployed?", "is commit/PR/branch X live on prod?", or "what's running on shotgundetour.com?" — checks the DigitalOcean App Platform active deployment and compares it to local/remote git history.
---

# Deployment Status

shotgundetour.com runs on DigitalOcean App Platform, auto-deploying every push to `main` of `github.com/dapinitial/d-tours`.

## ⚠️ Naming drift (three names, one app)

- **Product/domain:** shotgundetour.com
- **GitHub repo & local remote:** `dapinitial/d-tours`
- **Live DO app:** `shotgundetour-app` — id `9ba062fb-3811-49da-9204-a5848f75afb6` (verified 2026-07-06)
- **`.do/app.yaml` is STALE**: it says `name: d-tours`. The deployed app was created as `shotgundetour-app`; treat the live app (not the spec file) as truth. Do not "fix" the yaml casually — pushing a renamed spec can orphan/duplicate the app.

## Check what's deployed

Primary (verified): `doctl` is installed and authenticated.

```bash
# Deployed commit + when
doctl apps get 9ba062fb-3811-49da-9204-a5848f75afb6 --output json |
  jq -r '.[0].active_deployment | {commit: .services[0].source_commit_hash, phase: .phase, updated: .updated_at}'

# In-flight / recent deploys (a push takes a few minutes to go ACTIVE)
doctl apps list-deployments 9ba062fb-3811-49da-9204-a5848f75afb6 --output json |
  jq -r '.[0:5][] | [.phase, .services[0].source_commit_hash[0:7], .updated_at] | @tsv'
```

Alternative when the DigitalOcean MCP is connected: `mcp__digitalocean-mcp-local__apps-list` / `apps-get-deployment-status` (already in the permission allowlist).

## Answer "is X live?"

```bash
git fetch origin
DEPLOYED=$(doctl apps get 9ba062fb-3811-49da-9204-a5848f75afb6 --output json | jq -r '.[0].active_deployment.services[0].source_commit_hash')

git merge-base --is-ancestor <target-sha> "$DEPLOYED" && echo "✅ live" || echo "❌ not deployed"
```

- `<target-sha>` can be a commit, a merge commit of a PR, or `origin/main`.
- Queued-but-not-live: `git log --oneline "$DEPLOYED"..origin/main` lists commits pushed but not yet in the active deployment.
- Local-only work: `git log --oneline "$DEPLOYED"..HEAD` includes unpushed commits too — if a commit is in that range but not on `origin/main`, it needs a push before it can ever deploy.

Report per-environment style: there is only one environment (prod); a ✅/❌ single line is enough.

## When a deploy looks stuck or broken

- `phase` values: `PENDING/BUILDING/DEPLOYING` (in flight), `ACTIVE` (live), `ERROR` (failed — get logs).
- Build/runtime logs: `doctl apps logs 9ba062fb-3811-49da-9204-a5848f75afb6 --type build` (or `--type run`).
- Secrets (`SUPABASE_SECRET_KEY`, `WATCH_TOKEN`, SMTP, …) are encrypted envs in the DO dashboard on the **shotgundetour-app** app — they are not in `.do/app.yaml`, so a fresh app created from the yaml will boot in mock mode.
