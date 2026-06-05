import type { APIRoute } from 'astro';
import { getSupabaseAdmin } from '../../lib/supabase';
import { supabaseServer, authConfigured } from '../../lib/supabaseServer';

export const prerender = false;

// Owner-only journal posting. media[] holds Storage URLs (photos) and/or video
// embed URLs (YouTube/Vimeo/etc). `published` sets published_at now (Tier 2);
// otherwise it queues (Tier 1) until flushed. Same gate + tenant scoping as the rest.
async function requireOwner(cookies: any, headers: Headers): Promise<{ tenantId: string | null } | { error: string; status: number }> {
  if (!authConfigured) return { tenantId: null };
  const supabase = supabaseServer(cookies, headers);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'not authenticated', status: 401 };
  const { data: crew } = await supabase
    .from('crew').select('tenant_id, display_name').eq('email', user.email).eq('is_owner', true).maybeSingle();
  if (!crew) return { error: 'not an owner', status: 403 };
  return { tenantId: crew.tenant_id };
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = await requireOwner(cookies, request.headers);
  if ('error' in auth) return json({ ok: false, error: auth.error }, auth.status);
  const tid = auth.tenantId;

  let p: any = {};
  try { p = await request.json(); } catch {}
  const title = String(p.title ?? '').slice(0, 160).trim();
  const body = String(p.body ?? '').slice(0, 5000).trim();
  if (!title && !body && !(Array.isArray(p.media) && p.media.length)) {
    return json({ ok: false, error: 'add a title, some words, or a photo' }, 400);
  }
  const media = Array.isArray(p.media) ? p.media.filter((m: any) => typeof m === 'string').slice(0, 12) : [];

  const row: any = {
    title: title || '📷',
    body,
    media,
    tier: p.published ? 2 : 1,
    published_at: p.published ? new Date().toISOString() : null,
    ...(p.lat != null ? { lat: p.lat } : {}),
    ...(p.lng != null ? { lng: p.lng } : {}),
    ...(tid ? { tenant_id: tid } : {}),
  };

  const sb = getSupabaseAdmin();
  if (!sb) return json({ ok: true, mock: true, ...row });

  const { data, error } = await sb.from('posts').insert(row).select('id').single();
  if (error) { console.error('[post]', error.message); return json({ ok: false, error: 'Couldn’t save the post — try again.' }, 500); }
  return json({ ok: true, id: data?.id, published: !!p.published });
};

function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json' } });
}
