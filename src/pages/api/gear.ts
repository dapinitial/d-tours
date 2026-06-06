import type { APIRoute } from 'astro';
import { getSupabaseAdmin } from '../../lib/supabase';
import { supabaseServer, authConfigured } from '../../lib/supabaseServer';

export const prerender = false;

// Owner-gated gear CRUD (edited from the CMS). `specs` is freeform jsonb — track
// any per-item detail (tag year, last re-sling, length/diameter/finish, watts…).
async function requireOwner(cookies: any, headers: Headers): Promise<{ tenantId: string | null } | { error: string; status: number }> {
  if (!authConfigured) return { tenantId: null };
  const supabase = supabaseServer(cookies, headers);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'not authenticated', status: 401 };
  const { data: crew } = await supabase.from('crew').select('tenant_id').eq('email', user.email).eq('is_owner', true).maybeSingle();
  if (!crew) return { error: 'not an owner', status: 403 };
  return { tenantId: crew.tenant_id };
}

const FIELDS = ['name', 'category', 'subcategory', 'emoji', 'status', 'qty', 'note', 'loaned_to', 'specs'] as const;
function pick(o: any) {
  const out: Record<string, any> = {};
  for (const k of FIELDS) if (o?.[k] !== undefined) out[k] = o[k] === '' ? null : o[k];
  if (out.qty != null) out.qty = Number(out.qty) || null;
  return out;
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = await requireOwner(cookies, request.headers);
  if ('error' in auth) return json({ ok: false, error: auth.error }, auth.status);
  const tid = auth.tenantId;

  let payload: any = {};
  try { payload = await request.json(); } catch {}
  const { action, id, item } = payload;
  if (!action) return json({ ok: false, error: 'missing action' }, 400);

  const sb = getSupabaseAdmin();
  if (!sb) return json({ ok: true, mock: true, action, id: id ?? item?.id });
  const scoped = (q: any) => (tid ? q.eq('tenant_id', tid) : q);

  try {
    switch (action) {
      case 'add': {
        const row = { ...pick(item), id: item?.id, status: item?.status ?? 'packed', ...(tid ? { tenant_id: tid } : {}) };
        if (!row.name) return json({ ok: false, error: 'name required' }, 400);
        if (!row.category) row.category = 'Misc';
        const { error } = await sb.from('gear').insert(row);
        if (error) throw error;
        return json({ ok: true, action, id: item?.id });
      }
      case 'update': {
        const { error } = await scoped(sb.from('gear').update(pick(item)).eq('id', id ?? item?.id));
        if (error) throw error;
        return json({ ok: true, action, id: id ?? item?.id });
      }
      case 'remove': {
        const { error } = await scoped(sb.from('gear').delete().eq('id', id));
        if (error) throw error;
        return json({ ok: true, action, id });
      }
      default: return json({ ok: false, error: `unknown action ${action}` }, 400);
    }
  } catch (e: any) {
    console.error('[gear]', e?.message ?? e);
    return json({ ok: false, error: 'Couldn’t save — try again.' }, 500);
  }
};

function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json' } });
}
