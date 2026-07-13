import type { APIRoute } from 'astro';
import { getStops, getTenantBySlug, getDefaultTenant, getCompanions, getRendezvous } from '../../lib/data';
import { haversineMi, driveHours } from '../../lib/proximity';
import { publicPosition } from '../../lib/location';
import { getSupabaseAdmin } from '../../lib/supabase';
import { getTrail } from '../../lib/track';

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
  const admin = getSupabaseAdmin(); // for the accumulated GPS breadcrumb (track_points)
  for (const t of TRIPS) {
    const tenant = t.isDefault ? await getDefaultTenant() : await getTenantBySlug(t.slug!);
    if (!tenant) continue;
    const stops = (await getStops(tenant.id))
      .filter((s) => (s.status ?? 'confirmed') !== 'declined' && s.lat != null && s.lng != null)
      .sort((a, b) => a.order - b.order);
    if (!stops.length) continue;
    // The route is a breadcrumb: the REACHED portion draws solid; everything ahead
    // (future or undated) draws as a faint ghost so the shape of the trip is visible
    // without pretending it's happened. Reached = effective date <= today.
    const isReached = (s: any) => { const d = effDate(s); return d != null && d <= today; };
    const reached = stops.filter(isReached);
    const route = reached.map((s) => [s.lat, s.lng]);
    const ahead = stops.filter((s) => !isReached(s)).map((s) => [s.lat, s.lng]);
    if (route.length && ahead.length) ahead.unshift(route[route.length - 1]); // bridge solid→ghost
    // The actual travelled path (accumulated GPS breadcrumb), floored at trip_start.
    const trail = admin ? await getTrail(tenant, admin) : [];
    // Current position: the trip's own inReach MapShare feed when set, else a
    // companion's phone-GPS check-in, else approximate at a mid-route stop.
    let position = await mapsharePosition(tenant);          // any trip with an inReach feed
    if (!position) {
      const comp = byName[t.name];                          // phone-GPS check-in (e.g. Derek)
      if (comp && typeof comp.last_lat === 'number' && typeof comp.last_lng === 'number') {
        position = { lat: comp.last_lat, lng: comp.last_lng, when: relTime(comp.last_seen), live: true };
      }
    }
    // Approximate mid-route dot ONLY for trips with no known start (legacy). A trip with a
    // trip_start shows a dot only from a REAL fix at/after that date — before the trip (or
    // when the inReach is off) we show NO dot rather than implying we're somewhere on route.
    if (!position && !tenant?.trip_start) {
      const mid = stops[Math.floor((stops.length - 1) * (t.isDefault ? 0.5 : 0.65))];
      position = { lat: mid.lat, lng: mid.lng, when: `near ${mid.name}`, live: false };
    }
    // This is the PUBLIC feed — respect the owner's location-privacy choice (the owner's
    // own watcher/CMS uses the precise position elsewhere). off → no dot; approximate → fuzz.
    position = publicPosition(position, tenant.location_sharing);
    out.push({
      slug: tenant.slug, name: t.name, color: t.color,
      route,
      ahead,
      trail,
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

// Latest inReach MapShare point for a tenant's own feed, or null when none. Falls back
// to the env feed only for David's default trip (backward-compat until his row is read).
async function mapsharePosition(tenant: any) {
  const feed = tenant?.mapshare_feed_url || (tenant?.is_default ? process.env.MAPSHARE_FEED_URL : null);
  if (!feed) return null;
  try {
    const res = await fetch(feed);
    const kml = await res.text();
    const m = [...kml.matchAll(/<coordinates>\s*([-\d.]+),([-\d.]+)/g)].pop();
    if (!m) return null;
    const when = kml.match(/<when>([^<]+)<\/when>/g)?.pop()?.replace(/<\/?when>/g, '');
    // Floor at trip_start: a fix from before the trip (an old inReach session) is not
    // "where we are now" — drop it so the map falls back rather than showing a stale dot.
    if (tenant?.trip_start && when) {
      const floor = new Date(`${tenant.trip_start}T00:00:00Z`).getTime();
      const at = new Date(when).getTime();
      if (!isNaN(floor) && !isNaN(at) && at < floor) return null;
    }
    return { lat: parseFloat(m[2]), lng: parseFloat(m[1]), when: when ?? 'now', live: true };
  } catch { return null; }
}

function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json' } });
}
