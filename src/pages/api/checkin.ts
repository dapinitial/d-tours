import type { APIRoute } from 'astro';
import { getSupabaseAdmin } from '../../lib/supabase';

export const prerender = false;

// Phone-GPS check-in for companions without an inReach. Derek opens his personal
// /track/<key> page, which POSTs the browser's geolocation here. Gated by the
// secret track_key (he's not logged in) — no auth, just the unguessable key.
//   POST /api/checkin  { key, lat, lng }
export const POST: APIRoute = async ({ request }) => {
  let p: any = {};
  try { p = await request.json(); } catch {}
  const key = String(p.key ?? '');
  const lat = Number(p.lat), lng = Number(p.lng);
  if (!key.startsWith('trk_') || !isFinite(lat) || !isFinite(lng)) return json({ ok: false, error: 'bad request' }, 400);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return json({ ok: false, error: 'bad coords' }, 400);

  const sb = getSupabaseAdmin();
  if (!sb) return json({ ok: true, mock: true });
  const { data, error } = await sb.from('companions')
    .update({ last_lat: lat, last_lng: lng, last_seen: new Date().toISOString() })
    .eq('track_key', key).select('name').maybeSingle();
  if (error || !data) return json({ ok: false, error: 'unknown tracking key' }, 404);
  return json({ ok: true, name: data.name });
};

function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json' } });
}
