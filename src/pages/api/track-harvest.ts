import type { APIRoute } from 'astro';
import { getSupabaseAdmin } from '../../lib/supabase';
import { getDefaultTenant } from '../../lib/data';
import { harvestTrackPoints, getTrail } from '../../lib/track';

export const prerender = false;

// Manual/test trigger for the GPS-breadcrumb harvest (the /api/watch cron also does this
// every ~30 min). Token-gated like the other cron endpoints. Returns how many new points
// landed + the current trail length, so you can confirm the feed is flowing.
//   GET /api/track-harvest?token=<WATCH_TOKEN>
export const POST: APIRoute = async ({ request, url }) => {
  const token = process.env.WATCH_TOKEN;
  if (token) {
    const auth = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? url.searchParams.get('token') ?? '';
    if (auth !== token) return json({ ok: false, error: 'unauthorized' }, 401);
  }
  const sb = getSupabaseAdmin();
  if (!sb) return json({ ok: true, mock: true });
  const tenant = await getDefaultTenant();
  if (!tenant) return json({ ok: false, error: 'no default tenant' }, 404);

  const result = await harvestTrackPoints(tenant, sb);
  const trail = await getTrail(tenant, sb);
  return json({ ok: true, ...result, trail_points: trail.length, trip_start: tenant.trip_start ?? null });
};

export const GET = POST;

function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d, null, 2), { status, headers: { 'Content-Type': 'application/json' } });
}
