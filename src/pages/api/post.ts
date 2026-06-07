import type { APIRoute } from 'astro';
import { getSupabaseAdmin } from '../../lib/supabase';
import { supabaseServer, authConfigured } from '../../lib/supabaseServer';
import { getLivePosition } from '../../lib/proximity';

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

  // Update an existing post — edit text + add photos/videos after the fact.
  if (p.action === 'update') {
    if (!p.id) return json({ ok: false, error: 'missing id' }, 400);
    const upd: any = {};
    if (p.title !== undefined) upd.title = String(p.title).slice(0, 160).trim() || '📷';
    if (p.body !== undefined) upd.body = String(p.body).slice(0, 5000).trim();
    if (Array.isArray(p.media)) upd.media = p.media.filter((m: any) => typeof m === 'string').slice(0, 12);
    if (p.published !== undefined) { upd.tier = p.published ? 2 : 1; upd.published_at = p.published ? new Date().toISOString() : null; }
    if (typeof p.lat === 'number') upd.lat = p.lat;
    if (typeof p.lng === 'number') upd.lng = p.lng;
    const sbU = getSupabaseAdmin();
    if (!sbU) return json({ ok: true, mock: true, id: p.id });
    let q = sbU.from('posts').update(upd).eq('id', p.id);
    if (tid) q = q.eq('tenant_id', tid);
    const { error } = await q;
    if (error) { console.error('[post:update]', error.message); return json({ ok: false, error: 'Update failed' }, 500); }
    return json({ ok: true, id: p.id, updated: true });
  }

  // Delete a post (owner-gated, tenant-scoped).
  if (p.action === 'delete') {
    if (!p.id) return json({ ok: false, error: 'missing id' }, 400);
    const sb0 = getSupabaseAdmin();
    if (!sb0) return json({ ok: true, mock: true, deleted: p.id });
    let q = sb0.from('posts').delete().eq('id', p.id);
    if (tid) q = q.eq('tenant_id', tid);
    const { error } = await q;
    if (error) { console.error('[post:delete]', error.message); return json({ ok: false, error: 'Delete failed' }, 500); }
    return json({ ok: true, deleted: p.id });
  }

  const title = String(p.title ?? '').slice(0, 160).trim();
  const body = String(p.body ?? '').slice(0, 5000).trim();
  if (!title && !body && !(Array.isArray(p.media) && p.media.length)) {
    return json({ ok: false, error: 'add a title, some words, or a photo' }, 400);
  }
  const media = Array.isArray(p.media) ? p.media.filter((m: any) => typeof m === 'string').slice(0, 12) : [];

  // Geotag: prefer the photo's EXIF coords (sent from the composer); else fall back
  // to David's live inReach position right now ("nearest ping").
  let lat = typeof p.lat === 'number' ? p.lat : null;
  let lng = typeof p.lng === 'number' ? p.lng : null;
  if (lat == null || lng == null) {
    try { const pos = await getLivePosition(); if (pos && !pos.mock) { lat = pos.lat; lng = pos.lng; } } catch {}
  }

  const row: any = {
    title: title || '📷',
    body,
    media,
    tier: p.published ? 2 : 1,
    published_at: p.published ? new Date().toISOString() : null,
    ...(lat != null ? { lat } : {}),
    ...(lng != null ? { lng } : {}),
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
