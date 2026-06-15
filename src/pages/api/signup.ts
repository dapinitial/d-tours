import type { APIRoute } from 'astro';
import { getSupabaseAdmin } from '../../lib/supabase';
import { supabaseServer, authConfigured } from '../../lib/supabaseServer';
import { getDefaultTenant } from '../../lib/data';
import { guard } from '../../lib/ratelimit';

export const prerender = false;

// 🚐 Caravan sign-ups. PUBLIC: anyone signs up for a specific climb (no `action`) as
//   'climb' = JOIN CLIMB (roped up) | 'ride' = RIDE ALONG (holds down the rig).
// Lands as 'pending'. OWNER: moderate (action confirm|decline|remove|add).
// Mirrors /api/rendezvous — same gate, same shape.
export const POST: APIRoute = async ({ request, cookies }) => {
  const limited = guard(request, 'signup', { capacity: 6, refillPerSec: 1 / 20 });
  if (limited) return limited;
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
        case 'confirm':
          return done(await scoped(sb.from('signups').update({ status: 'confirmed' }).eq('id', p.id)), 'confirm', p.id);
        case 'decline':
          return done(await scoped(sb.from('signups').update({ status: 'declined' }).eq('id', p.id)), 'decline', p.id);
        case 'remove':
          return done(await scoped(sb.from('signups').delete().eq('id', p.id)), 'remove', p.id);
        case 'add': {
          const row = { ...pick(p.signup ?? p), id: rid(), status: 'confirmed', ...(tid ? { tenant_id: tid } : {}) };
          if (!row.name || !row.objective_id) return json({ ok: false, error: 'name + objective_id required' }, 400);
          return done(await sb.from('signups').insert(row), 'add');
        }
        default: return json({ ok: false, error: `unknown action ${p.action}` }, 400);
      }
    } catch (e: any) { return json({ ok: false, error: e?.message ?? String(e) }, 500); }
  }

  // ── public sign-up ──
  const name = String(p.name ?? '').slice(0, 80).trim();
  const objective_id = String(p.objective_id ?? '').trim();
  if (!name) return json({ ok: false, error: 'Add your name so we know who’s in.' }, 400);
  if (!objective_id) return json({ ok: false, error: 'missing objective' }, 400);
  const role = p.role === 'ride' ? 'ride' : 'climb';
  const tid = sb ? ((await getDefaultTenant())?.id ?? null) : null;
  const row = { id: rid(), objective_id, name, role, contact: clip(p.contact, 120), note: clip(p.note, 280), status: 'pending', ...(tid ? { tenant_id: tid } : {}) };
  if (!sb) return json({ ok: true, mock: true, ...row });
  const { error } = await sb.from('signups').insert(row);
  if (error) { console.error('[signup]', error.message); return json({ ok: false, error: 'Couldn’t sign you up — try again.' }, 500); }
  return json({ ok: true, role });
};

const FIELDS = ['objective_id', 'name', 'contact', 'role', 'note'] as const;
function pick(o: any) {
  const out: Record<string, any> = {};
  for (const k of FIELDS) if (o?.[k] !== undefined && o[k] !== '') out[k] = typeof o[k] === 'string' ? o[k].slice(0, 280) : o[k];
  if (out.role !== 'ride') out.role = 'climb';
  return out;
}
const clip = (v: any, n: number) => (v ? String(v).slice(0, n) : null);
function rid() { return (globalThis.crypto?.randomUUID?.() ?? `sup-${Date.now()}-${Math.random().toString(36).slice(2)}`); }

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
