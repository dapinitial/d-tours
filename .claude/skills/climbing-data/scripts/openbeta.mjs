#!/usr/bin/env node
// OpenBeta climbing-data client — the PRODUCT-SAFE source (open license, real API).
// Zero deps. Their API 502s intermittently, so requests retry with backoff.
//
// Usage:
//   node openbeta.mjs near --lat 49.68 --lng -123.15 [--miles 10]   # crags + climb counts near a point
//   node openbeta.mjs crag --id <uuid>                              # one crag's climbs w/ grades
//   node openbeta.mjs search --q "Squamish"                         # find areas by name

const API = 'https://api.openbeta.io';

async function gql(query, variables, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables }),
      });
      if (res.status >= 500) throw new Error(`HTTP ${res.status}`); // 502s are transient
      const j = await res.json();
      if (j.errors) throw Object.assign(new Error(j.errors[0].message), { fatal: true });
      return j.data;
    } catch (e) {
      if (e.fatal || i === tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
}

const NEAR = `query($lat: Float!, $lng: Float!, $maxDistance: Int!) {
  cragsNear(lnglat: { lat: $lat, lng: $lng }, maxDistance: $maxDistance, includeCrags: true) {
    count
    crags { uuid areaName totalClimbs metadata { lat lng } }
  }
}`;

const CRAG = `query($uuid: ID) {
  area(uuid: $uuid) {
    areaName totalClimbs metadata { lat lng }
    climbs { name type { sport trad bouldering alpine } grades { yds vscale } }
  }
}`;

const SEARCH = `query($match: String!) {
  areas(filter: { area_name: { match: $match } }) {
    uuid areaName totalClimbs pathTokens metadata { lat lng }
  }
}`;

function parseArgs(rest) {
  const o = {};
  for (let i = 0; i < rest.length; i += 2) o[rest[i].replace(/^--/, '')] = rest[i + 1];
  return o;
}

const [cmd, ...rest] = process.argv.slice(2);
const a = parseArgs(rest);
let out;
if (cmd === 'near') {
  const meters = Math.round((parseFloat(a.miles ?? '10')) * 1609);
  const d = await gql(NEAR, { lat: parseFloat(a.lat), lng: parseFloat(a.lng), maxDistance: meters });
  out = d.cragsNear;
} else if (cmd === 'crag') {
  out = (await gql(CRAG, { uuid: a.id })).area;
} else if (cmd === 'search') {
  out = (await gql(SEARCH, { match: a.q })).areas;
} else {
  console.error('Usage: node openbeta.mjs near --lat <n> --lng <n> [--miles n] | crag --id <uuid> | search --q <name>');
  process.exit(2);
}
console.log(JSON.stringify(out, null, 2));
