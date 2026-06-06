import type { APIRoute } from 'astro';
import { getSupabaseAdmin } from '../../lib/supabase';
import { supabaseServer, authConfigured } from '../../lib/supabaseServer';
import { getDefaultTenant } from '../../lib/data';

export const prerender = false;

// Rendezvous coordination. PUBLIC: anyone who got the shared plan proposes a
// meet-up (no `action`). OWNER: moderate (action confirm|decline|add|remove).
// Mirrors the suggestions pattern: proposals land in the CMS; confirmed ones
// surface publicly on the plan.
export const POST: APIRoute = async ({ request, cookies }) => {
  let p: any = {};
  try { p = await request.json(); } catch {}
  const sb = getSupabaseAdmin();

  // ── owner moderation ──
  if (p.action) {
    const tid = await ownerTenant(cookies, request.headers);
    if (tid && typeof tid === 'object') return json({ ok: false, error: tid.error }, tid.status);
    if (!sb) return json({ ok: true, mock: true, action: p.action, id: p.id });
    const scoped = (q: any) => (tid ? q.eq('tenant_id', tid) : q);
    try {
      switch (p.action) {
        case 'confirm': {
          const patch: any = { status: 'confirmed' };
          for (const k of ['place', 'when_text', 'lat', 'lng']) if (p.rdv?.[k] != null) patch[k] = p.rdv[k];
          return done(await scoped(sb.from('rendezvous').update(patch).eq('id', p.id)), 'confirm', p.id);
        }
        case 'decline':
          return done(await scoped(sb.from('rendezvous').update({ status: 'declined' }).eq('id', p.id)), 'decline', p.id);
        case 'remove':
          return done(await scoped(sb.from('rendezvous').delete().eq('id', p.id)), 'remove', p.id);
        case 'add': {
          const row = { ...pick(p.rdv), id: rid(), status: 'confirmed', proposed_by: 'David', ...(tid ? { tenant_id: tid } : {}) };
          if (!row.name) return json({ ok: false, error: 'name required' }, 400);
          return done(await sb.from('rendezvous').insert(row), 'add');
        }
        default: return json({ ok: false, error: `unknown action ${p.action}` }, 400);
      }
    } catch (e: any) { return json({ ok: false, error: e?.message ?? String(e) }, 500); }
  }

  // ── public propose ──
  const name = String(p.name ?? '').slice(0, 80).trim();
  if (!name) return json({ ok: false, error: 'Who should we look out for?' }, 400);
  const tid = sb ? ((await getDefaultTenant())?.id ?? null) : null;
  const row = { ...pick(p), id: rid(), status: 'proposed', proposed_by: name, ...(tid ? { tenant_id: tid } : {}) };
  if (!sb) return json({ ok: true, mock: true, ...row });
  const { error } = await sb.from('rendezvous').insert(row);
  if (error) { console.error('[rendezvous]', error.message); return json({ ok: false, error: 'Couldn’t send that — try again.' }, 500); }
  return json({ ok: true });
};

const FIELDS = ['name', 'place', 'when_text', 'note', 'lat', 'lng'] as const;
function pick(o: any) {
  const out: Record<string, any> = {};
  for (const k of FIELDS) if (o?.[k] !== undefined && o[k] !== '') out[k] = typeof o[k] === 'string' ? o[k].slice(0, 280) : o[k];
  return out;
}
function rid() { return (globalThis.crypto?.randomUUID?.() ?? `rdv-${Date.now()}-${Math.random().toString(36).slice(2)}`); }

async function ownerTenant(cookies: any, headers: Headers): Promise<string | null | { error: string; status: number }> {
  if (!authConfigured) return null;
  const supabase = supabaseServer(cookies, headers);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'not authenticated', status: 401 };
  const { data: crew } = await supabase.from('crew').select('tenant_id').eq('email', user.email).eq('is_owner', true).maybeSingle();
  if (!crew) return { error: 'not an owner', status: 403 };
  return crew.tenant_id;
}
function done(res: any, action: string, id?: string) { if (res?.error) throw res.error; return json({ ok: true, action, id }); }
function json(d: unknown, s = 200) { return new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } }); }
