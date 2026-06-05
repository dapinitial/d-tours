import type { APIRoute } from 'astro';
import { getSupabaseAdmin } from '../../lib/supabase';
import { supabaseServer, authConfigured } from '../../lib/supabaseServer';

export const prerender = false;

// Owner-only source/beta-library mutation. Same gate as the itinerary editor:
// writes go through the service role, but the caller must be a signed-in owner,
// and every write is scoped to THEIR tenant. The home-iMac Claude enriches via
// the service-role / MCP connection separately (writes `beta` + status).
async function requireOwner(cookies: any, headers: Headers): Promise<{ tenantId: string | null } | { error: string; status: number }> {
  if (!authConfigured) return { tenantId: null }; // local/mock dev: allow
  const supabase = supabaseServer(cookies, headers);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'not authenticated', status: 401 };
  const { data: crew } = await supabase
    .from('crew').select('tenant_id').eq('email', user.email).eq('is_owner', true).maybeSingle();
  if (!crew) return { error: 'not an owner', status: 403 };
  return { tenantId: crew.tenant_id };
}

// Whitelist the columns an owner may set, so a stray field can't be injected.
const FIELDS = ['url', 'title', 'note', 'tag', 'stop_id', 'objective_id'] as const;
function pick(stop: any) {
  const out: Record<string, any> = {};
  for (const k of FIELDS) if (stop?.[k] !== undefined) out[k] = stop[k] === '' ? null : stop[k];
  return out;
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = await requireOwner(cookies, request.headers);
  if ('error' in auth) return json({ ok: false, error: auth.error }, auth.status);
  const tid = auth.tenantId;

  let payload: any = {};
  try { payload = await request.json(); } catch {}
  const { action, source, id } = payload;
  if (!action) return json({ ok: false, error: 'missing action' }, 400);

  const sb = getSupabaseAdmin();
  if (!sb) return json({ ok: true, mock: true, action, id: id ?? source?.id });

  const scoped = (q: any) => (tid ? q.eq('tenant_id', tid) : q);

  try {
    switch (action) {
      case 'add': {
        const row = { ...pick(source), id: source?.id, status: 'new', ...(tid ? { tenant_id: tid } : {}) };
        const { error } = await sb.from('sources').insert(row);
        if (error) throw error;
        return json({ ok: true, action, id: source?.id });
      }
      case 'update': {
        const { error } = await scoped(sb.from('sources').update(pick(source)).eq('id', id ?? source?.id));
        if (error) throw error;
        return json({ ok: true, action, id: id ?? source?.id });
      }
      case 'remove': {
        const { error } = await scoped(sb.from('sources').delete().eq('id', id));
        if (error) throw error;
        return json({ ok: true, action, id });
      }
      default:
        return json({ ok: false, error: `unknown action ${action}` }, 400);
    }
  } catch (e: any) {
    return json({ ok: false, error: e?.message ?? String(e) }, 500);
  }
};

function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json' } });
}
