import type { APIRoute } from 'astro';
import { getObjectives } from '../../lib/data';
import { haversineMi, driveHours } from '../../lib/proximity';

export const prerender = false;

// "What awesome climbs am I near?" Given a position, returns objectives ranked by
// distance with a rough drive-time + a within-N-hours flag. Powers the location-
// aware "Help us decide" strip AND the proactive watcher (email when you roll near one).
//   GET /api/nearby?lat=40.3&lng=-105.6&hours=3

export const GET: APIRoute = async ({ url }) => {
  const lat = Number(url.searchParams.get('lat'));
  const lng = Number(url.searchParams.get('lng'));
  const hours = Number(url.searchParams.get('hours') ?? 3);
  if (!isFinite(lat) || !isFinite(lng)) return json({ error: 'lat/lng required' }, 400);

  const objectives = await getObjectives(undefined, { includeProposed: true });
  const ranked = objectives
    .filter((o) => typeof o.lat === 'number' && typeof o.lng === 'number')
    .map((o) => {
      const mi = haversineMi(lat, lng, o.lat as number, o.lng as number);
      const hrs = driveHours(mi);
      return {
        id: o.id, name: o.name, grade: o.grade, region: o.region,
        status: o.status ?? 'confirmed', note: o.note ?? null,
        miles: Math.round(mi), drive_hours: Math.round(hrs * 10) / 10,
        within: hrs <= hours,
      };
    })
    .sort((a, b) => a.miles - b.miles);

  return json({ from: { lat, lng }, hours, count: ranked.length, nearby: ranked.filter((r) => r.within), all: ranked });
};

function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json' } });
}
