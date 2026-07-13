// GPS breadcrumb: harvest points from a trip's Garmin inReach MapShare KML feed and
// accumulate them in track_points, so the live map can draw the real path travelled
// (not just the planned stops). Points before the trip's trip_start are dropped.
import type { SupabaseClient } from '@supabase/supabase-js';

export interface TrackPoint { at: string; lat: number; lng: number; ele?: number }

// Parse EVERY point in a Garmin Raw KML feed. Each tracked fix is a <Placemark> with a
// <TimeStamp><when> and a <Point><coordinates>lng,lat[,ele]. We pair them per-Placemark
// (parsing globally would mis-match when/coords across placemarks). Placemarks without
// both — e.g. the summary track line — are skipped.
export function parseTrackPoints(kml: string): TrackPoint[] {
  const out: TrackPoint[] = [];
  for (const m of kml.matchAll(/<Placemark\b[\s\S]*?<\/Placemark>/g)) {
    const block = m[0];
    const when = block.match(/<when>([^<]+)<\/when>/)?.[1]?.trim();
    const coord = block.match(/<coordinates>\s*([-\d.]+),([-\d.]+)(?:,([-\d.]+))?/);
    if (!when || !coord) continue;
    const at = new Date(when);
    const lng = parseFloat(coord[1]);
    const lat = parseFloat(coord[2]);
    if (isNaN(at.getTime()) || isNaN(lat) || isNaN(lng)) continue;
    out.push({ at: at.toISOString(), lat, lng, ele: coord[3] ? parseFloat(coord[3]) : undefined });
  }
  // Chronological, de-duplicated by timestamp (Garmin can repeat the last point).
  out.sort((a, b) => a.at.localeCompare(b.at));
  return out.filter((p, i) => i === 0 || p.at !== out[i - 1].at);
}

function feedFor(tenant: any): string | null {
  return tenant?.mapshare_feed_url || (tenant?.is_default ? process.env.MAPSHARE_FEED_URL?.trim() : null) || null;
}

/** Midnight UTC of the trip_start floor, or null when the trip has no start set. */
function floorISO(tenant: any): string | null {
  if (!tenant?.trip_start) return null;
  const d = new Date(`${tenant.trip_start}T00:00:00Z`);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// Fetch the feed, keep points at/after trip_start and newer than what we've stored,
// and upsert them. Best-effort: returns a count, never throws to the caller.
export async function harvestTrackPoints(tenant: any, sb: SupabaseClient): Promise<{ added: number; skipped?: string }> {
  const feed = feedFor(tenant);
  if (!feed) return { added: 0, skipped: 'no feed' };
  const floor = floorISO(tenant);
  try {
    // Ask Garmin for everything since the floor (d1); if it ignores the param we still
    // filter + dedupe below, so it's safe either way.
    const url = floor ? `${feed}${feed.includes('?') ? '&' : '?'}d1=${encodeURIComponent(floor)}` : feed;
    const res = await fetch(url);
    if (!res.ok) return { added: 0, skipped: `feed ${res.status}` };
    const kml = await res.text();

    let points = parseTrackPoints(kml);
    if (floor) points = points.filter((p) => p.at >= floor); // never store pre-trip points
    if (!points.length) return { added: 0 };

    // Only insert points newer than the latest we already have (cheap incremental append).
    const { data: last } = await sb.from('track_points')
      .select('at').eq('tenant_id', tenant.id).order('at', { ascending: false }).limit(1).maybeSingle();
    if (last?.at) points = points.filter((p) => p.at > new Date(last.at).toISOString());
    if (!points.length) return { added: 0 };

    // upsert on the unique (tenant_id, at) — ignore duplicates from overlapping harvests.
    const rows = points.map((p) => ({ tenant_id: tenant.id, at: p.at, lat: p.lat, lng: p.lng, ele: p.ele ?? null }));
    const { error } = await sb.from('track_points').upsert(rows, { onConflict: 'tenant_id,at', ignoreDuplicates: true });
    if (error) return { added: 0, skipped: error.message };
    return { added: rows.length };
  } catch (e: any) {
    return { added: 0, skipped: e?.message ?? 'error' };
  }
}

/** Ordered breadcrumb for the map (at/after trip_start). Empty on any read problem. */
export async function getTrail(tenant: any, sb: SupabaseClient): Promise<[number, number][]> {
  try {
    let q = sb.from('track_points').select('lat, lng, at').eq('tenant_id', tenant.id).order('at', { ascending: true });
    const floor = floorISO(tenant);
    if (floor) q = q.gte('at', floor);
    const { data } = await q;
    return (data ?? []).map((r: any) => [r.lat, r.lng]);
  } catch {
    return [];
  }
}
