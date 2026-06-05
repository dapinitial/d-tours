import type { APIRoute } from 'astro';
import { lookAhead } from '../../lib/dtours/overpass';

export const prerender = false;

// Live D-Tours look-ahead: query OSM around a position for the next stretch.
// Defaults to the Winds; pass ?lat=&lng= to scout elsewhere. Proves the loop
// against a real, key-free data source.
const DEFAULT_CATS = ['water', 'fuel', 'food', 'camp', 'viewpoint', 'climbing', 'water_body'];

export const POST: APIRoute = async ({ url }) => {
  const lat = Number(url.searchParams.get('lat') ?? 42.7);
  const lng = Number(url.searchParams.get('lng') ?? -109.2);
  const radiusM = Number(url.searchParams.get('radius') ?? 25000);
  const catsParam = url.searchParams.get('cats');
  const categories = (catsParam ? catsParam.split(',') : DEFAULT_CATS) as any;
  const found = await lookAhead({ lat, lng, radiusM, categories });
  const detours = diversify(found);
  return new Response(JSON.stringify({ at: { lat, lng }, count: detours.length, detours }, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const GET = POST;

// Stop one plentiful category (usually food) from drowning out the interesting
// stuff. Drop unnamed POIs, then round-robin across types — nearest-first within
// each — so a scan surfaces water + gas + a swimming hole + a crag, not 8 tacos.
function diversify(found: any[]) {
  const named = found.filter((d) => d.title && !isGeneric(d.title));
  const byType = new Map<string, any[]>();
  for (const d of named) {
    if (!byType.has(d.type)) byType.set(d.type, []);
    byType.get(d.type)!.push(d);
  }
  for (const list of byType.values()) list.sort((a, b) => a.off_route_mi - b.off_route_mi);
  const out: any[] = [];
  let added = true;
  while (added) {
    added = false;
    for (const list of byType.values()) {
      if (list.length) { out.push(list.shift()); added = true; }
    }
  }
  return out;
}

// A title equal to its prettified category means OSM had no real name for it.
function isGeneric(title: string) {
  const t = title.toLowerCase();
  return ['food', 'fuel', 'water', 'camp', 'viewpoint', 'climbing', 'water body', 'restaurant'].includes(t);
}
