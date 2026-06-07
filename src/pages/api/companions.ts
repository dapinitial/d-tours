import type { APIRoute } from 'astro';
import { getSupabaseAdmin } from '../../lib/supabase';
import { supabaseServer, authConfigured } from '../../lib/supabaseServer';

export const prerender = false;

// Owner-gated squad CRUD (edited from /cms/squad). Each companion gets a secret
// track_key → their personal /track/<key> phone-GPS share link.
async function requireOwner(cookies: any, headers: Headers): Promise<{ tenantId: string | null } | { error: string; status: number }> {
  if (!authConfigured) return { tenantId: null };
  const supabase = supabaseServer(cookies, headers);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'not authenticated', status: 401 };
  const { data: crew } = await supabase.from('crew').select('tenant_id').eq('email', user.email).eq('is_owner', true).maybeSingle();
  if (!crew) return { error: 'not an owner', status: 403 };
  return { tenantId: crew.tenant_id };
}

const FIELDS = ['name', 'nickname', 'emoji', 'color', 'role', 'leg', 'joins_at', 'joins_lat', 'joins_lng', 'status', 'status_note', 'mapshare_url', 'note', 'sort', 'published'] as const;
function pick(o: any) {
  const out: Record<string, any> = {};
  for (const k of FIELDS) if (o?.[k] !== undefined) out[k] = o[k] === '' ? null : o[k];
  for (const n of ['joins_lat', 'joins_lng', 'sort']) if (out[n] != null) out[n] = Number(out[n]);
  if (out.published !== undefined) out.published = !!out.published;
  return out;
}
const newKey = () => 'trk_' + (crypto.randomUUID?.() ?? `${Date.now()}${Math.random()}`).replace(/-/g, '');

export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = await requireOwner(cookies, request.headers);
  if ('error' in auth) return json({ ok: false, error: auth.error }, auth.status);
  const tid = auth.tenantId;

  let payload: any = {};
  try { payload = await request.json(); } catch {}
  const { action, id, item } = payload;
  if (!action) return json({ ok: false, error: 'missing action' }, 400);

  const sb = getSupabaseAdmin();
  if (!sb) return json({ ok: true, mock: true, action });
  const scoped = (q: any) => (tid ? q.eq('tenant_id', tid) : q);

  try {
    switch (action) {
      case 'add': {
        const row = { ...pick(item), track_key: newKey(), ...(tid ? { tenant_id: tid } : {}) };
        if (!row.name) return json({ ok: false, error: 'name required' }, 400);
        const { data, error } = await sb.from('companions').insert(row).select('id, track_key').single();
        if (error) throw error;
        return json({ ok: true, action, id: data?.id, track_key: data?.track_key });
      }
      case 'update': {
        const { error } = await scoped(sb.from('companions').update(pick(item)).eq('id', id ?? item?.id));
        if (error) throw error;
        return json({ ok: true, action, id: id ?? item?.id });
      }
      case 'remove': {
        const { error } = await scoped(sb.from('companions').delete().eq('id', id));
        if (error) throw error;
        return json({ ok: true, action, id });
      }
      case 'regen': {
        const track_key = newKey();
        const { error } = await scoped(sb.from('companions').update({ track_key }).eq('id', id));
        if (error) throw error;
        return json({ ok: true, action, id, track_key });
      }
      default: return json({ ok: false, error: `unknown action ${action}` }, 400);
    }
  } catch (e: any) {
    console.error('[companions]', e?.message ?? e);
    return json({ ok: false, error: 'Couldn’t save — try again.' }, 500);
  }
};

function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json' } });
}
