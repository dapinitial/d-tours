import type { APIRoute } from 'astro';
import { getSupabaseAdmin } from '../../lib/supabase';
import { supabaseServer, authConfigured } from '../../lib/supabaseServer';

export const prerender = false;

// Owner-gated skills CRUD (edited from /cms/skills) — pin/swap the video for each
// technique, add new ones, reorder.
async function requireOwner(cookies: any, headers: Headers): Promise<{ tenantId: string | null } | { error: string; status: number }> {
  if (!authConfigured) return { tenantId: null };
  const supabase = supabaseServer(cookies, headers);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'not authenticated', status: 401 };
  const { data: crew } = await supabase.from('crew').select('tenant_id').eq('email', user.email).eq('is_owner', true).maybeSingle();
  if (!crew) return { error: 'not an owner', status: 403 };
  return { tenantId: crew.tenant_id };
}

const FIELDS = ['category', 'name', 'description', 'video_url', 'sort'] as const;
function pick(o: any) {
  const out: Record<string, any> = {};
  for (const k of FIELDS) if (o?.[k] !== undefined) out[k] = o[k] === '' ? null : o[k];
  if (out.sort != null) out.sort = Number(out.sort) || 0;
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
  if (!sb) return json({ ok: true, mock: true, action });
  const scoped = (q: any) => (tid ? q.eq('tenant_id', tid) : q);

  try {
    switch (action) {
      case 'add': {
        const row = { ...pick(item), ...(tid ? { tenant_id: tid } : {}) };
        if (!row.name || !row.category) return json({ ok: false, error: 'name + category required' }, 400);
        const { data, error } = await sb.from('skills').insert(row).select('id').single();
        if (error) throw error;
        return json({ ok: true, action, id: data?.id });
      }
      case 'update': {
        const { error } = await scoped(sb.from('skills').update(pick(item)).eq('id', id ?? item?.id));
        if (error) throw error;
        return json({ ok: true, action, id: id ?? item?.id });
      }
      case 'remove': {
        const { error } = await scoped(sb.from('skills').delete().eq('id', id));
        if (error) throw error;
        return json({ ok: true, action, id });
      }
      default: return json({ ok: false, error: `unknown action ${action}` }, 400);
    }
  } catch (e: any) {
    console.error('[skills]', e?.message ?? e);
    return json({ ok: false, error: 'Couldn’t save — try again.' }, 500);
  }
};

function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json' } });
}
