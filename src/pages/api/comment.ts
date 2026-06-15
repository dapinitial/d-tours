import type { APIRoute } from 'astro';
import { getSupabaseAdmin } from '../../lib/supabase';
import { supabaseServer, authConfigured } from '../../lib/supabaseServer';
import { getDefaultTenant } from '../../lib/data';
import { notify } from '../../lib/notifier';
import { guard } from '../../lib/ratelimit';

export const prerender = false;

// Comments on dossiers (objectives) and journal posts. PUBLIC submit lands as
// unapproved AND pings David on his channels (iMessage→email→SMS gateway). OWNER
// moderates (approve/decline/remove). Shows publicly once approved.
export const POST: APIRoute = async ({ request, cookies }) => {
  const limited = guard(request, 'comment', { capacity: 6, refillPerSec: 1 / 20 });
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
      if (p.action === 'approve') return done(await scoped(sb.from('comments').update({ approved: true }).eq('id', p.id)));
      if (p.action === 'decline' || p.action === 'remove') return done(await scoped(sb.from('comments').delete().eq('id', p.id)));
      return json({ ok: false, error: `unknown action ${p.action}` }, 400);
    } catch (e: any) { return json({ ok: false, error: e?.message ?? String(e) }, 500); }
  }

  // ── public submit ──
  const author = String(p.author ?? '').slice(0, 60).trim() || 'a follower';
  const body = String(p.body ?? '').slice(0, 1000).trim();
  if (!body) return json({ ok: false, error: 'Say something first 🙂' }, 400);
  const target = p.target === 'post' ? 'post' : 'objective';
  if (!p.id) return json({ ok: false, error: 'missing target' }, 400);

  const tid = sb ? ((await getDefaultTenant())?.id ?? null) : null;
  const row: any = {
    author, body, approved: false, tenant_id: tid,
    ...(target === 'objective' ? { objective_id: p.id } : { post_id: p.id }),
  };
  if (!sb) return json({ ok: true, mock: true, ...row });

  const { error } = await sb.from('comments').insert(row);
  if (error) { console.error('[comment]', error.message); return json({ ok: false, error: 'Couldn’t post that — try again.' }, 500); }

  // 📲 Ping David (best-effort — never blocks the comment). iMessage if a host is
  // running it, else email (Gmail) — which pushes to his phone.
  try {
    await notify({
      subject: `💬 New comment from ${author}`,
      body: `${author} commented on ${target} ${p.id}:\n\n"${body}"\n\nApprove it in the CMS.`,
      short: `💬 ${author}: ${body}`.slice(0, 160),
    });
  } catch {}

  return json({ ok: true });
};

async function ownerTenant(cookies: any, headers: Headers): Promise<string | null | { error: string; status: number }> {
  if (!authConfigured) return null;
  const supabase = supabaseServer(cookies, headers);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'not authenticated', status: 401 };
  const { data: crew } = await supabase.from('crew').select('tenant_id').eq('email', user.email).eq('is_owner', true).maybeSingle();
  if (!crew) return { error: 'not an owner', status: 403 };
  return crew.tenant_id;
}
function done(res: any) { if (res?.error) throw res.error; return json({ ok: true }); }
function json(d: unknown, s = 200) { return new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } }); }
