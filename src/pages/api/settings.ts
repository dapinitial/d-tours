import type { APIRoute } from 'astro';
import { getSupabaseAdmin } from '../../lib/supabase';
import { supabaseServer, authConfigured } from '../../lib/supabaseServer';

export const prerender = false;

// Owner-only per-trip settings (tracking feed, location privacy, contact, fuel links,
// visibility). Same gate + tenant scoping as the other CMS write endpoints: the owner's
// tenant id is resolved server-side from their crew row — never from client input.
async function requireOwner(cookies: any, headers: Headers): Promise<{ tenantId: string | null } | { error: string; status: number }> {
  if (!authConfigured) return { tenantId: null };
  const supabase = supabaseServer(cookies, headers);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'not authenticated', status: 401 };
  const { data: crew } = await supabase.from('crew').select('tenant_id').eq('email', user.email).eq('is_owner', true).maybeSingle();
  if (!crew) return { error: 'not an owner', status: 403 };
  return { tenantId: crew.tenant_id };
}

const SHARING = ['precise', 'approximate', 'off'];
const okUrl = (u: string) => /^(https?:|mailto:|sms:|tel:)/i.test(u.trim());

export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = await requireOwner(cookies, request.headers);
  if ('error' in auth) return json({ ok: false, error: auth.error }, auth.status);
  const tid = auth.tenantId;

  let body: any = {};
  try { body = await request.json(); } catch {}

  const patch: Record<string, any> = {};
  if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.slice(0, 80).trim();
  if (typeof body.tagline === 'string') patch.tagline = body.tagline.slice(0, 160).trim() || null;
  if (typeof body.mapshare_feed_url === 'string') patch.mapshare_feed_url = body.mapshare_feed_url.trim() || null;
  if (typeof body.contact_email === 'string') patch.contact_email = body.contact_email.trim() || null;
  if (typeof body.contact_phone === 'string') patch.contact_phone = body.contact_phone.replace(/[^\d+]/g, '') || null;
  if (SHARING.includes(body.location_sharing)) patch.location_sharing = body.location_sharing;
  if (body.visibility === 'public' || body.visibility === 'private') patch.visibility = body.visibility;
  if (Array.isArray(body.support_links)) {
    patch.support_links = body.support_links
      .filter((l: any) => l && typeof l.label === 'string' && l.label.trim() && typeof l.url === 'string' && okUrl(l.url))
      .slice(0, 8)
      .map((l: any) => ({ label: l.label.slice(0, 40).trim(), url: l.url.trim() }));
  }
  if (!Object.keys(patch).length) return json({ ok: false, error: 'Nothing to update.' }, 400);

  const sb = getSupabaseAdmin();
  if (!sb) return json({ ok: true, mock: true });
  const q = sb.from('tenants').update(patch);
  const { error } = await (tid ? q.eq('id', tid) : q.eq('is_default', true));
  if (error) { console.error('[settings]', error.message); return json({ ok: false, error: 'Couldn’t save — try again.' }, 500); }
  return json({ ok: true });
};

function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json' } });
}
