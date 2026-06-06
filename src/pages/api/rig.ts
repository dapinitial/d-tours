import type { APIRoute } from 'astro';
import { getSupabaseAdmin } from '../../lib/supabase';
import { supabaseServer, authConfigured } from '../../lib/supabaseServer';

export const prerender = false;

// Owner-gated upsert of the single rig row for the tenant (edited from the CMS).
async function requireOwner(cookies: any, headers: Headers): Promise<{ tenantId: string | null } | { error: string; status: number }> {
  if (!authConfigured) return { tenantId: null };
  const supabase = supabaseServer(cookies, headers);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'not authenticated', status: 401 };
  const { data: crew } = await supabase.from('crew').select('tenant_id').eq('email', user.email).eq('is_owner', true).maybeSingle();
  if (!crew) return { error: 'not an owner', status: 403 };
  return { tenantId: crew.tenant_id };
}

const FIELDS = ['name', 'tagline', 'video_url', 'living', 'photos', 'capabilities', 'build', 'maintenance', 'bulbs', 'tools', 'service_log'] as const;

export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = await requireOwner(cookies, request.headers);
  if ('error' in auth) return json({ ok: false, error: auth.error }, auth.status);
  const tid = auth.tenantId;

  let payload: any = {};
  try { payload = await request.json(); } catch {}
  const rig = payload.rig ?? {};
  const row: Record<string, any> = { updated_at: new Date().toISOString() };
  for (const k of FIELDS) if (rig[k] !== undefined) row[k] = rig[k] === '' ? null : rig[k];

  const sb = getSupabaseAdmin();
  if (!sb) return json({ ok: true, mock: true });
  if (!tid) return json({ ok: false, error: 'no tenant' }, 400);
  row.tenant_id = tid;

  try {
    const { error } = await sb.from('rig').upsert(row, { onConflict: 'tenant_id' });
    if (error) throw error;
    return json({ ok: true });
  } catch (e: any) {
    console.error('[rig]', e?.message ?? e);
    return json({ ok: false, error: 'Couldn’t save — try again.' }, 500);
  }
};

function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json' } });
}
