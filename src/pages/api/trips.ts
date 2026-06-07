import type { APIRoute } from 'astro';
import { getStops, getTenantBySlug, getDefaultTenant, getCompanions } from '../../lib/data';

export const prerender = false;

// "12 min ago" style label for a check-in timestamp.
function relTime(iso?: string | null): string {
  if (!iso) return 'now';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

// Multi-trip feed for the "where's everyone" map: each registered trip's planned
// route (from stop coords) + a current position, plus the rendezvous points where
// two routes meet. The coordination view — see Derek in relation to David.
const TRIPS = [
  { slug: null,    name: 'David', color: '#34d399', isDefault: true },
  { slug: 'derek', name: 'Derek', color: '#fb923c' },
];

export const GET: APIRoute = async () => {
  const out: any[] = [];
  // Companions can carry a phone-GPS check-in position (for folks without an inReach).
  const companions = await getCompanions();
  const byName: Record<string, any> = Object.fromEntries(companions.map((c) => [c.name, c]));
  for (const t of TRIPS) {
    const tenant = t.isDefault ? await getDefaultTenant() : await getTenantBySlug(t.slug!);
    if (!tenant) continue;
    const stops = (await getStops(tenant.id))
      .filter((s) => (s.status ?? 'confirmed') !== 'declined' && s.lat != null && s.lng != null)
      .sort((a, b) => a.order - b.order);
    if (!stops.length) continue;
    const route = stops.map((s) => [s.lat, s.lng]);
    // Current position. For the default trip use the live MapShare feed when set;
    // otherwise approximate at a mid-route stop (clearly labelled, until a feed exists).
    let position = null as any;
    if (t.isDefault) {
      position = await mapsharePosition();                 // David → inReach MapShare
    } else {
      const comp = byName[t.name];                          // Derek → phone-GPS check-in
      if (comp && typeof comp.last_lat === 'number' && typeof comp.last_lng === 'number') {
        position = { lat: comp.last_lat, lng: comp.last_lng, when: relTime(comp.last_seen), live: true };
      }
    }
    if (!position) {
      const mid = stops[Math.floor((stops.length - 1) * (t.isDefault ? 0.5 : 0.65))];
      position = { lat: mid.lat, lng: mid.lng, when: `near ${mid.name}`, live: false };
    }
    out.push({
      slug: tenant.slug, name: t.name, color: t.color,
      route,
      stops: stops.map((s) => ({ name: s.name, lat: s.lat, lng: s.lng, emoji: s.emoji ?? '📍' })),
      position,
    });
  }

  // Rendezvous = stops that appear (≈same coords) on more than one route.
  const rendezvous: any[] = [];
  if (out.length >= 2) {
    for (const a of out[0].stops) {
      for (const b of out[1].stops) {
        if (Math.abs(a.lat - b.lat) < 0.15 && Math.abs(a.lng - b.lng) < 0.15) {
          rendezvous.push({ name: a.name, lat: a.lat, lng: a.lng });
        }
      }
    }
  }
  return json({ trips: out, rendezvous });
};

// Latest inReach MapShare point, or null when no feed is configured.
async function mapsharePosition() {
  const feed = process.env.MAPSHARE_FEED_URL;
  if (!feed) return null;
  try {
    const res = await fetch(feed);
    const kml = await res.text();
    const m = [...kml.matchAll(/<coordinates>\s*([-\d.]+),([-\d.]+)/g)].pop();
    if (!m) return null;
    const when = kml.match(/<when>([^<]+)<\/when>/g)?.pop()?.replace(/<\/?when>/g, '');
    return { lat: parseFloat(m[2]), lng: parseFloat(m[1]), when: when ?? 'now', live: true };
  } catch { return null; }
}

function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json' } });
}
