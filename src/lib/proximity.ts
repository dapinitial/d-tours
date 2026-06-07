// Shared geo + live-position helpers for the location-aware features:
// the /api/nearby ranking, the proactive /api/watch alerter, and the live map.

const R_MI = 3958.8;

/** Great-circle distance in miles. */
export function haversineMi(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_MI * Math.asin(Math.sqrt(s));
}

/** Rough drive-time: mountain roads ≈ straight-line × 1.35, ~45 mph average. */
export const driveHours = (straightMi: number) => (straightMi * 1.35) / 45;

export interface LivePosition { lat: number; lng: number; when?: string; mock: boolean }

/** Latest inReach MapShare point. Mock (Cirque) when no feed is configured, so
 *  the map still renders — but `mock:true` lets the watcher SKIP (no false alerts). */
export async function getLivePosition(): Promise<LivePosition | null> {
  const feed = process.env.MAPSHARE_FEED_URL?.trim(); // tolerate stray whitespace in the env value
  if (!feed) return { lat: 42.7, lng: -109.2, when: 'mock · Cirque of the Towers', mock: true };
  try {
    const kml = await (await fetch(feed)).text();
    const matches = [...kml.matchAll(/<coordinates>\s*([-\d.]+),([-\d.]+)/g)];
    if (!matches.length) return null;
    const last = matches[matches.length - 1];
    const when = kml.match(/<when>([^<]+)<\/when>/g)?.pop()?.replace(/<\/?when>/g, '');
    return { lng: parseFloat(last[1]), lat: parseFloat(last[2]), when, mock: false };
  } catch {
    return null;
  }
}
