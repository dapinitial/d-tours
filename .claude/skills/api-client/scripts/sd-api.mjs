#!/usr/bin/env node
// Shotgun Detour API client — thin CLI over the routes in src/pages/api/.
// Zero deps; token-gated cron routes read WATCH_TOKEN/DIGEST_TOKEN from .env.
//
// Usage:
//   node sd-api.mjs <route> [--base local|prod|<url>] [--post] [--key value ...]
//
// Examples:
//   node sd-api.mjs trips --base prod
//   node sd-api.mjs nearby --lat 49.68 --lng -123.15
//   node sd-api.mjs refresh-conditions --base prod --post        # auto-attaches WATCH_TOKEN
//   node sd-api.mjs digest --base prod --cadence weekly          # auto-attaches DIGEST_TOKEN
//   node sd-api.mjs settings --post --json '{"support_links":[]}'
//
// Query params: every --key value pair becomes ?key=value (GET) unless --post,
// where pairs become the JSON body (use --json '<raw>' to send an explicit body).

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASES = { local: 'http://localhost:4321', prod: 'https://shotgundetour.com' };
// Routes gated by a bearer token; env var(s) that can hold it (first one set wins).
const TOKEN_ROUTES = {
  watch: ['WATCH_TOKEN'],
  brief: ['WATCH_TOKEN'],
  'refresh-conditions': ['WATCH_TOKEN'],
  digest: ['DIGEST_TOKEN', 'WATCH_TOKEN'],
};

function loadEnv() {
  // Walk up from this script to the repo root .env (works when run from anywhere).
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    try {
      const text = readFileSync(resolve(dir, '.env'), 'utf8');
      for (const line of text.split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
      return;
    } catch { dir = resolve(dir, '..'); }
  }
}

function parseArgs(argv) {
  const [route, ...rest] = argv;
  const opts = { base: 'local', post: false, json: null, params: {} };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--post') opts.post = true;
    else if (a === '--base') opts.base = rest[++i];
    else if (a === '--json') { opts.json = rest[++i]; opts.post = true; }
    else if (a.startsWith('--')) opts.params[a.slice(2)] = rest[++i];
    else { console.error(`Unexpected arg: ${a}`); process.exit(2); }
  }
  return { route, opts };
}

const { route, opts } = parseArgs(process.argv.slice(2));
if (!route) {
  console.error('Usage: node sd-api.mjs <route> [--base local|prod|<url>] [--post] [--json <body>] [--key value ...]');
  console.error(`Token-gated routes (token auto-attached from .env): ${Object.keys(TOKEN_ROUTES).join(', ')}`);
  process.exit(2);
}

loadEnv();
const base = BASES[opts.base] ?? opts.base;
const headers = { Accept: 'application/json' };

const tokenVars = TOKEN_ROUTES[route];
if (tokenVars) {
  const token = tokenVars.map((v) => process.env[v]).find(Boolean);
  if (!token) { console.error(`Route "${route}" needs ${tokenVars.join(' or ')} in .env`); process.exit(2); }
  headers.Authorization = `Bearer ${token}`;
}

let url = `${base}/api/${route}`;
let body;
if (opts.post) {
  headers['Content-Type'] = 'application/json';
  body = opts.json ?? JSON.stringify(opts.params);
} else if (Object.keys(opts.params).length) {
  url += '?' + new URLSearchParams(opts.params).toString();
}

const res = await fetch(url, { method: opts.post ? 'POST' : 'GET', headers, body });
const text = await res.text();
if (!res.ok) console.error(`HTTP ${res.status} ${res.statusText}`);
try { console.log(JSON.stringify(JSON.parse(text), null, 2)); }
catch { console.log(text); }
process.exit(res.ok ? 0 : 1);
