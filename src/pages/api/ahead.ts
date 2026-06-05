import type { APIRoute } from 'astro';
import { lookAhead, type PoiCategory } from '../../lib/dtours/overpass';

export const prerender = false;

// The "don't miss out" filter. Drive Mode / the proactive watcher pulls EVERYTHING
// nearby; this decides what's actually worth INTERRUPTING David for. It scans the
// corridor, scores each find by his taste, and only returns the genuinely notable,
// in-reach stuff — so a ping means "hot spring / crag / swimming hole ahead," never
// "there's a gas station." Gas/food are the job of Apple Maps, not a surprise ping.

// How much David would pull over for each category (0 = never ping).
const TASTE: Partial<Record<PoiCategory, number>> = {
  climbing: 10,
  water_body: 9,   // swimming holes, wild water
  viewpoint: 7,
  camp: 6,         // free camping angle
  track: 6,
  fitness: 6,
  water: 3,        // springs (useful, not exciting)
  // fuel/food deliberately omitted — that's Apple Maps' job, not a surprise ping.
};
const TASTE_CATS = Object.keys(TASTE) as PoiCategory[];
const PING_THRESHOLD = 6; // only interrupt for taste >= this

export const POST: APIRoute = async ({ url }) => {
  const lat = Number(url.searchParams.get('lat'));
  const lng = Number(url.searchParams.get('lng'));
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return json({ error: 'lat & lng required' }, 400);
  }
  const radiusM = Number(url.searchParams.get('radius') ?? 20000);
  const found = await lookAhead({ lat, lng, radiusM, categories: TASTE_CATS });

  const notable = found
    .filter((d) => d.title && !isGeneric(d.title))
    .map((d) => ({ ...d, taste: TASTE[d.type as PoiCategory] ?? 0 }))
    .filter((d) => d.taste >= PING_THRESHOLD)
    // worth-it score: taste, gently penalized by how far off-line it is
    .sort((a, b) => (b.taste - b.off_route_mi * 0.3) - (a.taste - a.off_route_mi * 0.3))
    .slice(0, 6);

  return json({ at: { lat, lng }, pings: notable.length, detours: notable }, 200);
};

export const GET = POST;

function isGeneric(title: string) {
  return ['climbing', 'viewpoint', 'camp', 'water', 'water body', 'fitness', 'track']
    .includes(title.toLowerCase());
}

function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d, null, 2), { status, headers: { 'Content-Type': 'application/json' } });
}
