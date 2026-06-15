import type { APIRoute } from 'astro';
import { getSupabaseAdmin } from '../../lib/supabase';
import { supabaseServer, authConfigured } from '../../lib/supabaseServer';
import { detourToStop } from '../../lib/dtours/propose';

export const prerender = false;

// Owner-only itinerary mutation. All writes go through the service role, but the
// caller must be a signed-in owner, and every write is scoped to THEIR tenant so
// one owner can never touch another's trip.
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

export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = await requireOwner(cookies, request.headers);
  if ('error' in auth) return json({ ok: false, error: auth.error }, auth.status);
  const tid = auth.tenantId;

  let payload: any = {};
  try { payload = await request.json(); } catch {}
  const { action, stop, id, items, detour } = payload;
  if (!action) return json({ ok: false, error: 'missing action' }, 400);

  const sb = getSupabaseAdmin();
  if (!sb) return json({ ok: true, mock: true, action, id: id ?? stop?.id });

  // tenant guard applied to every row-targeting write
  const scoped = (q: any) => (tid ? q.eq('tenant_id', tid) : q);

  // Auto-file a committed stop into the chapter whose date range contains its
  // start_date (so the client never has to know chapter boundaries). The chapter
  // starting on-or-before the date, whose end is on-or-after it (or open-ended), wins.
  const fileChapter = async (row: any) => {
    if (!row?.start_date || row.chapter_id) return row;
    let q = sb.from('chapters').select('id,end_date').lte('start_date', row.start_date)
      .order('start_date', { ascending: false }).limit(1);
    if (tid) q = q.eq('tenant_id', tid);
    const { data } = await q;
    const c = (data ?? [])[0];
    if (c && (!c.end_date || c.end_date >= row.start_date)) row.chapter_id = c.id;
    return row;
  };

  try {
    switch (action) {
      case 'add': {
        const row = await fileChapter(tid ? { ...stop, tenant_id: tid } : { ...stop });
        const { error } = await sb.from('stops').upsert(row);
        if (error) throw error;
        return json({ ok: true, action, id: stop?.id, chapter_id: row.chapter_id ?? null });
      }
      case 'update': {
        const row = await fileChapter({ ...stop });
        const { error } = await scoped(sb.from('stops').update(row).eq('id', id ?? stop?.id));
        if (error) throw error;
        return json({ ok: true, action, id: id ?? stop?.id, chapter_id: row.chapter_id ?? null });
      }
      case 'stage': {
        // Drive Mode dropped a live detour onto the plan. Stage it (proposed/
        // suggested) just past the current last stop so it shows as "coming up".
        if (!detour) return json({ ok: false, error: 'missing detour' }, 400);
        const { data: last } = await scoped(
          sb.from('stops').select('order').order('order', { ascending: false }).limit(1),
        ).maybeSingle();
        const after = Math.ceil(Number(last?.order ?? 0)) + 1;
        const row = { ...detourToStop(detour, after - 0.5), order: after, ...(tid ? { tenant_id: tid } : {}) };
        const { error } = await sb.from('stops').upsert(row);
        if (error) throw error;
        return json({ ok: true, action, id: row.id, order: after });
      }
      case 'reorder': {
        for (const it of items ?? []) {
          const { error } = await scoped(sb.from('stops').update({ order: it.order }).eq('id', it.id));
          if (error) throw error;
        }
        return json({ ok: true, action, count: (items ?? []).length });
      }
      case 'promote': {
        const { error } = await scoped(sb.from('stops').update({ status: 'confirmed' }).eq('id', id));
        if (error) throw error;
        return json({ ok: true, action, id });
      }
      case 'decline': {
        const { error } = await scoped(sb.from('stops').update({ status: 'declined' }).eq('id', id));
        if (error) throw error;
        return json({ ok: true, action, id });
      }
      case 'remove': {
        const { error } = await scoped(sb.from('stops').delete().eq('id', id));
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
