// avalanche.org public forecast zones — free, no key. The daily conditions
// refresh maps each objective into its forecast zone (if any) so dossiers show
// the current danger rating next to the weather. Zones are MultiPolygons from
// https://api.avalanche.org/v2/public/products/map-layer (all US centers).

export interface AvalancheInfo {
  zone: string;          // zone display name
  center: string;        // issuing avalanche center
  center_id: string;
  danger: string;        // "considerable", "no rating" (off-season), …
  danger_level: number;  // 1–5; -1 = no rating
  off_season: boolean;
  travel_advice?: string;
  link?: string;         // zone forecast page
  updated_at: string;
}

type Ring = number[][]; // [lng, lat][]
interface ZoneFeature {
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: any };
  properties: Record<string, any>;
}

/** Ray-cast point-in-ring test (GeoJSON [lng, lat] order). */
export function pointInRing(lat: number, lng: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Find the forecast zone containing a point (outer rings only — zones have no holes). */
export function findZone(features: ZoneFeature[], lat: number, lng: number): ZoneFeature | null {
  for (const f of features) {
    const g = f.geometry;
    if (!g) continue;
    const polys: Ring[][] = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    for (const poly of polys) if (poly[0] && pointInRing(lat, lng, poly[0])) return f;
  }
  return null;
}

/** All US forecast zones, or null on any fetch problem (callers must leave data untouched then). */
export async function fetchAvalancheZones(): Promise<ZoneFeature[] | null> {
  try {
    const res = await fetch('https://api.avalanche.org/v2/public/products/map-layer');
    if (!res.ok) return null;
    const features = (await res.json())?.features;
    return Array.isArray(features) ? features : null;
  } catch {
    return null;
  }
}

/** Zone properties → the compact object stored in beta.conditions.avalanche. */
export function toAvalancheInfo(f: ZoneFeature): AvalancheInfo {
  const p = f.properties ?? {};
  return {
    zone: p.name ?? '',
    center: p.center ?? '',
    center_id: p.center_id ?? '',
    danger: p.danger ?? 'no rating',
    danger_level: typeof p.danger_level === 'number' ? p.danger_level : -1,
    off_season: !!p.off_season,
    travel_advice: p.travel_advice || undefined,
    link: p.link || undefined,
    updated_at: new Date().toISOString(),
  };
}
