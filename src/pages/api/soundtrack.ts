import type { APIRoute } from 'astro';
import { getSupabaseAdmin } from '../../lib/supabase';
import { supabaseServer, authConfigured } from '../../lib/supabaseServer';

export const prerender = false;

// Owner-only soundtrack control. Friends submit suggestions via the PUBLIC
// /api/playlist (status 'pending'); here the owner moderates them and "spins"
// tracks into the living soundtrack. Same gate + tenant scoping as itinerary.ts.
async function requireOwner(cookies: any, headers: Headers): Promise<{ tenantId: string | null } | { error: string; status: number }> {
  if (!authConfigured) return { tenantId: null };
  const supabase = supabaseServer(cookies, headers);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'not authenticated', status: 401 };
  const { data: crew } = await supabase
    .from('crew').select('tenant_id').eq('email', user.email).eq('is_owner', true).maybeSingle();
  if (!crew) return { error: 'not an owner', status: 403 };
  return { tenantId: crew.tenant_id };
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = await requireOwner(cookies, request.headers);
  if ('error' in auth) return json({ ok: false, error: auth.error }, auth.status);
  const tid = auth.tenantId;

  let payload: any = {};
  try { payload = await request.json(); } catch {}
  const { action, id, track } = payload;
  if (!action) return json({ ok: false, error: 'missing action' }, 400);

  const sb = getSupabaseAdmin();
  if (!sb) return json({ ok: true, mock: true, action, id });
  const scoped = (q: any) => (tid ? q.eq('tenant_id', tid) : q);

  try {
    switch (action) {
      case 'approve':
        return done(await scoped(sb.from('playlist_suggestions').update({ status: 'approved' }).eq('id', id)), action, id);
      case 'decline':
        return done(await scoped(sb.from('playlist_suggestions').update({ status: 'declined' }).eq('id', id)), action, id);
      case 'remove':
        return done(await scoped(sb.from('playlist_suggestions').delete().eq('id', id)), action, id);
      case 'play': {
        // Spin it: stamp played_at (= now playing) + where we are. Auto-approve.
        const patch: any = { status: 'approved', played_at: new Date().toISOString() };
        if (track?.region) patch.region = String(track.region).slice(0, 80);
        if (track?.lat != null) patch.lat = track.lat;
        if (track?.lng != null) patch.lng = track.lng;
        return done(await scoped(sb.from('playlist_suggestions').update(patch).eq('id', id)), action, id);
      }
      case 'add': {
        // Owner adds a track directly, optionally already playing.
        const row: any = {
          title: String(track?.title ?? '').slice(0, 120).trim(),
          url: track?.url ? String(track.url).slice(0, 300) : null,
          kind: ['music', 'audiobook', 'podcast'].includes(track?.kind) ? track.kind : 'music',
          suggested_by: String(track?.by ?? 'David').slice(0, 60),
          status: 'approved',
          ...(track?.play ? { played_at: new Date().toISOString(), region: track?.region ?? null } : {}),
          ...(tid ? { tenant_id: tid } : {}),
        };
        if (!row.title) return json({ ok: false, error: 'title required' }, 400);
        return done(await sb.from('playlist_suggestions').insert(row), action);
      }
      default:
        return json({ ok: false, error: `unknown action ${action}` }, 400);
    }
  } catch (e: any) {
    return json({ ok: false, error: e?.message ?? String(e) }, 500);
  }
};

function done(res: any, action: string, id?: string) {
  if (res?.error) throw res.error;
  return json({ ok: true, action, id });
}
function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json' } });
}
