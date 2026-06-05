import type { APIRoute } from 'astro';
import { getSupabaseAdmin } from '../../lib/supabase';
import { supabaseServer, authConfigured } from '../../lib/supabaseServer';
import { getDefaultTenant } from '../../lib/data';

export const prerender = false;

// A follower suggests a detour/stop → `suggestions` table (status 'pending').
// PUBLIC: submit (no `action`). OWNER: moderate (action 'approve'|'decline').
// Approve stages it onto the itinerary as a proposed stop, the same lane as a
// D-Tours pick — so the suggester's idea actually reaches the trip.
export const POST: APIRoute = async ({ request, cookies }) => {
  let p: any = {};
  try { p = await request.json(); } catch {}
  const sb = getSupabaseAdmin();

  // ── owner moderation path ──
  if (p.action) {
    const tid = await ownerTenant(cookies, request.headers);
    if (tid && typeof tid === 'object') return json({ ok: false, error: tid.error }, tid.status);
    if (!sb) return json({ ok: true, mock: true, action: p.action, id: p.id });
    const scoped = (q: any) => (tid ? q.eq('tenant_id', tid) : q);
    try {
      if (p.action === 'decline') {
        const { error } = await scoped(sb.from('suggestions').update({ status: 'declined' }).eq('id', p.id));
        if (error) throw error;
        return json({ ok: true, action: 'decline', id: p.id });
      }
      if (p.action === 'approve') {
        const { data: sug } = await scoped(sb.from('suggestions').select('*').eq('id', p.id)).maybeSingle();
        if (!sug) return json({ ok: false, error: 'suggestion not found' }, 404);
        const { data: last } = await scoped(
          sb.from('stops').select('order').order('order', { ascending: false }).limit(1),
        ).maybeSingle();
        const order = Math.ceil(Number(last?.order ?? 0)) + 1;
        const stop = {
          id: `sug-${p.id}`.slice(0, 40),
          name: sug.title,
          sub: sug.location ? `Crew pick · ${sug.location}` : 'Crew pick',
          emoji: '💡', flex: 'open', status: 'proposed', kind: 'sidequest',
          source: 'shotgun', note: sug.note ?? null, order,
          ...(tid ? { tenant_id: tid } : {}),
        };
        const { error: se } = await sb.from('stops').upsert(stop);
        if (se) throw se;
        await scoped(sb.from('suggestions').update({ status: 'approved' }).eq('id', p.id));
        return json({ ok: true, action: 'approve', id: p.id, staged: stop.id });
      }
      return json({ ok: false, error: `unknown action ${p.action}` }, 400);
    } catch (e: any) {
      return json({ ok: false, error: e?.message ?? String(e) }, 500);
    }
  }

  // ── public submit path ──
  const title = String(p.title ?? '').slice(0, 120).trim();
  if (!title) return json({ ok: false, error: 'What should Shotgun check out?' }, 400);
  const tid = sb ? ((await getDefaultTenant())?.id ?? null) : null;
  const row = {
    title,
    location: String(p.location ?? '').slice(0, 120) || null,
    note: String(p.note ?? '').slice(0, 280) || null,
    suggested_by: String(p.by ?? '').slice(0, 60) || 'a follower',
    status: 'pending' as const,
    tenant_id: tid,
  };
  if (!sb) return json({ ok: true, mock: true, ...row });
  const { error } = await sb.from('suggestions').insert(row);
  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true });
};

async function ownerTenant(cookies: any, headers: Headers): Promise<string | null | { error: string; status: number }> {
  if (!authConfigured) return null;
  const supabase = supabaseServer(cookies, headers);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'not authenticated', status: 401 };
  const { data: crew } = await supabase
    .from('crew').select('tenant_id').eq('email', user.email).eq('is_owner', true).maybeSingle();
  if (!crew) return { error: 'not an owner', status: 403 };
  return crew.tenant_id;
}

function json(d: unknown, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });
}
