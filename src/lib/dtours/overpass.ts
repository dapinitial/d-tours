// D-Tours look-ahead: query OpenStreetMap (Overpass) for points of interest in a
// corridor around the next stretch of route. Key-free, the workhorse source.
// Maps OSM tags → D-Tours categories (water, gas, food, gym, track, camp, weird…).
import type { Detour } from '../types';

// Overpass requires a descriptive User-Agent + Accept or it returns 406.
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
const OVERPASS_HEADERS = {
  'Content-Type': 'application/x-www-form-urlencoded',
  'User-Agent': 'd-tours/0.1 (spacelabforever.com; road-trip companion)',
  'Accept': 'application/json',
};

export interface PoiQuery {
  lat: number;
  lng: number;
  radiusM?: number;        // search radius (corridor proxy)
  categories?: PoiCategory[];
}

export type PoiCategory =
  | 'water' | 'fuel' | 'food' | 'shower' | 'camp'
  | 'fitness' | 'track' | 'climbing' | 'rec_center' | 'viewpoint' | 'water_body';

// OSM tag filters per category.
const TAGS: Record<PoiCategory, string[]> = {
  water:      ['amenity=drinking_water', 'natural=spring'],
  fuel:       ['amenity=fuel'],
  food:       ['amenity=restaurant', 'amenity=fast_food', 'amenity=cafe'],
  shower:     ['amenity=shower'],
  camp:       ['tourism=camp_site'],
  fitness:    ['leisure=fitness_station'],
  track:      ['leisure=track'],
  climbing:   ['sport=climbing', 'leisure=sports_centre'],
  rec_center: ['leisure=sports_centre', 'amenity=community_centre'],
  viewpoint:  ['tourism=viewpoint'],
  water_body: ['leisure=slipway', 'natural=water'],
};

const EMOJI: Record<PoiCategory, string> = {
  water: '💧', fuel: '⛽', food: '🍔', shower: '🚿', camp: '🏕️',
  fitness: '🤸', track: '🏃', climbing: '🧗', rec_center: '🏋️',
  viewpoint: '👁️', water_body: '🌊',
};

function buildQuery(q: PoiQuery): string {
  const r = q.radiusM ?? 20000;
  const cats = q.categories ?? (['water', 'fuel', 'camp', 'fitness'] as PoiCategory[]);
  const clauses = cats.flatMap((c) =>
    TAGS[c].map((tag) => {
      const [k, v] = tag.split('=');
      return `node["${k}"="${v}"](around:${r},${q.lat},${q.lng});`;
    }),
  );
  return `[out:json][timeout:25];(${clauses.join('')});out body 40;`;
}

/** Fetch nearby POIs. Returns [] on any failure (so callers degrade gracefully). */
export async function lookAhead(q: PoiQuery): Promise<Detour[]> {
  const body = buildQuery(q);
  const payload = `data=${encodeURIComponent(body)}`;
  let json: any = null;
  // Try endpoints in order until one answers (mirrors cover rate-limits/outages).
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, { method: 'POST', headers: OVERPASS_HEADERS, body: payload });
      if (!res.ok) continue;
      json = await res.json();
      break;
    } catch {
      continue;
    }
  }
  if (!json) return [];
  try {
    return (json.elements ?? []).slice(0, 24).map((el: any, i: number): Detour => {
      const cat = categoryOf(el.tags ?? {});
      const miles = haversineMi(q.lat, q.lng, el.lat, el.lon);
      return {
        id: `osm-${el.id ?? i}`,
        type: cat,
        title: el.tags?.name ?? prettify(cat),
        emoji: EMOJI[cat] ?? '📍',
        off_route_mi: Math.round(miles * 10) / 10,
        time_cost_min: Math.round(miles * 3 + 10),
        lat: el.lat, lng: el.lon,
        fits_slack: true, // refined later against schedule slack
      };
    });
  } catch {
    return [];
  }
}

function categoryOf(tags: Record<string, string>): PoiCategory {
  for (const [cat, filters] of Object.entries(TAGS) as [PoiCategory, string[]][]) {
    if (filters.some((f) => { const [k, v] = f.split('='); return tags[k] === v; })) return cat;
  }
  return 'viewpoint';
}

function prettify(c: string) { return c.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()); }

function haversineMi(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 3958.8, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
