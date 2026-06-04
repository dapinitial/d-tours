#!/usr/bin/env node
// D-Tours corridor scan — the home-iMac agent runs this against the current
// MapShare position to find detours ahead, then filters by schedule slack and
// pings the good ones. Key-free (OpenStreetMap / Overpass).
//
//   node scripts/dtours-lookahead.mjs [lat] [lng]

import { lookAhead } from '../src/lib/dtours/overpass.ts';

const lat = Number(process.argv[2] ?? 42.7);
const lng = Number(process.argv[3] ?? -109.2);

console.log(`Scanning corridor around ${lat}, ${lng} …`);
const found = await lookAhead({
  lat, lng, radiusM: 25000,
  categories: ['water', 'fuel', 'camp', 'fitness', 'track', 'viewpoint'],
});

if (!found.length) {
  console.log('No POIs returned (Overpass may be busy / offline).');
} else {
  for (const d of found) {
    console.log(`${d.emoji} ${d.title} · ${d.off_route_mi}mi · ~${d.time_cost_min}min · ${d.type}`);
  }
}
