import type { APIRoute } from 'astro';
import { getStops, getTenantBySlug, getDefaultTenant, getCompanions, getRendezvous } from '../../lib/data';
import { haversineMi, driveHours } from '../../lib/proximity';

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
  // Date-clip horizon: the route GROWS as the trip is lived. A stop draws only once
  // its effective date is at-or-before today; future legs stay dark until reached.
  const today = new Date(); today.setHours(23, 59, 59, 999);
  const YEAR = today.getFullYear();
  const effDate = (s: any): Date | null => {
    if (!s.start_date && !s.date) return null;
    // structured ISO date is the truth; else parse the free-text label ("Aug 1") with
    // the trip year. Unparseable ("Mid-July") → null → stays in the planner, off the map.
    const d = s.start_date ? new Date(`${s.start_date}T12:00:00`) : new Date(`${s.date} ${YEAR}`);
    return isNaN(d.getTime()) ? null : d;
  };
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
    // Only the reached portion of the route draws (the breadcrumb so far). The full
    // `stops` list is still used below to approximate a position when no feed exists.
    const reached = stops.filter((s) => { const d = effDate(s); return d != null && d <= today; });
    const route = reached.map((s) => [s.lat, s.lng]);
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
      stops: reached.map((s) => ({ name: s.name, lat: s.lat, lng: s.lng, emoji: s.emoji ?? '📍' })),
      position,
    });
  }

  // Rendezvous (explicit meet-ups) with a LIVE ETA per person — drive-time from
  // their current position. Drift falls out for free: if someone isn't closing in,
  // their ETA just grows. `converge` = when the LAST person arrives (everyone's there).
  const rdvRows = await getRendezvous(undefined, 'confirmed');
  const rendezvous = rdvRows
    .filter((r: any) => typeof r.lat === 'number' && typeof r.lng === 'number')
    .map((r: any) => {
      const etas = out
        .filter((t) => t.position)
        .map((t) => {
          const mi = haversineMi(t.position.lat, t.position.lng, r.lat, r.lng);
          return { name: t.name, color: t.color, miles: Math.round(mi), hours: Math.round(driveHours(mi) * 10) / 10, live: !!t.position.live };
        })
        .sort((a, b) => a.hours - b.hours);
      const converge = etas.length ? Math.max(...etas.map((e) => e.hours)) : null;
      return { id: r.id, name: r.name, place: r.place ?? null, lat: r.lat, lng: r.lng, when_text: r.when_text ?? null, note: r.note ?? null, etas, converge };
    });
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
