import type { APIRoute } from 'astro';
import { getSupabaseAdmin } from '../../lib/supabase';
import { findDuplicateObjectives } from '../../lib/data';
import { supabaseServer, authConfigured } from '../../lib/supabaseServer';

export const prerender = false;

// Owner-only objective CRUD. Basics are hand-edited here; `beta` (the dossier) is
// Shotgun's job — it fills it from the pinned sources. Same gate + tenant scoping
// as itinerary.ts.
async function requireOwner(cookies: any, headers: Headers): Promise<{ tenantId: string | null } | { error: string; status: number }> {
  if (!authConfigured) return { tenantId: null };
  const supabase = supabaseServer(cookies, headers);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'not authenticated', status: 401 };
  const { data: crew } = await supabase.from('crew').select('tenant_id').eq('email', user.email).eq('is_owner', true).maybeSingle();
  if (!crew) return { error: 'not an owner', status: 403 };
  return { tenantId: crew.tenant_id };
}

const FIELDS = ['name', 'region', 'commitment', 'grade', 'hazard', 'severity', 'discipline', 'day_type', 'sort', 'gpx_url', 'gpx_verified', 'status', 'note'] as const;
function pick(o: any) {
  const out: Record<string, any> = {};
  for (const k of FIELDS) if (o?.[k] !== undefined) out[k] = o[k] === '' ? null : o[k];
  return out;
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = await requireOwner(cookies, request.headers);
  if ('error' in auth) return json({ ok: false, error: auth.error }, auth.status);
  const tid = auth.tenantId;

  let payload: any = {};
  try { payload = await request.json(); } catch {}
  const { action, id, obj, items } = payload;
  if (!action) return json({ ok: false, error: 'missing action' }, 400);

  const sb = getSupabaseAdmin();
  if (!sb) return json({ ok: true, mock: true, action, id: id ?? obj?.id });
  const scoped = (q: any) => (tid ? q.eq('tenant_id', tid) : q);

  try {
    switch (action) {
      case 'add': {
        const row = { ...pick(obj), id: obj?.id, severity: obj?.severity ?? 'med', ...(tid ? { tenant_id: tid } : {}) };
        if (!row.name) return json({ ok: false, error: 'name required' }, 400);
        // Dedup guard: refuse a likely-duplicate route unless the owner forces it.
        if (!obj?.force) {
          const dupes = await findDuplicateObjectives(obj.name, obj.lat, obj.lng, tid ?? undefined, obj.id);
          if (dupes.length) return json({ ok: false, dup: true, error: `Possible duplicate of "${dupes[0].name}"`, dupes }, 409);
        }
        const { error } = await sb.from('objectives').insert(row);
        if (error) throw error;
        return json({ ok: true, action, id: obj?.id });
      }
      case 'update': {
        const { error } = await scoped(sb.from('objectives').update(pick(obj)).eq('id', id ?? obj?.id));
        if (error) throw error;
        return json({ ok: true, action, id: id ?? obj?.id });
      }
      case 'remove': {
        const { error } = await scoped(sb.from('objectives').delete().eq('id', id));
        if (error) throw error;
        return json({ ok: true, action, id });
      }
      case 'promote': { // a scouted alternative → confirmed (shows on the public site)
        const { error } = await scoped(sb.from('objectives').update({ status: 'confirmed' }).eq('id', id));
        if (error) throw error;
        return json({ ok: true, action, id });
      }
      case 'reorder': { // drag-set trip-sequence order: [{ id, sort }, …]
        const list = Array.isArray(items) ? items : [];
        for (const it of list) {
          if (!it?.id) continue;
          const { error } = await scoped(sb.from('objectives').update({ sort: it.sort }).eq('id', it.id));
          if (error) throw error;
        }
        return json({ ok: true, action, count: list.length });
      }
      case 'requeue': { // clear alerted_at so the proximity watcher can alert this climb again
        const { error } = await scoped(sb.from('objectives').update({ alerted_at: null }).eq('id', id));
        if (error) throw error;
        return json({ ok: true, action, id });
      }
      case 'update-beta': { // owner edits the dossier beta (trailhead/approach/rack/…) from the CMS
        const oid = id ?? obj?.id;
        const patch = obj?.beta ?? {};
        const { data: cur } = await scoped(sb.from('objectives').select('beta').eq('id', oid)).maybeSingle();
        const merged = { ...((cur?.beta as any) ?? {}), ...patch }; // form sends complete sub-objects/arrays
        const { error } = await scoped(sb.from('objectives').update({ beta: merged }).eq('id', oid));
        if (error) throw error;
        return json({ ok: true, action, id: oid });
      }
      default: return json({ ok: false, error: `unknown action ${action}` }, 400);
    }
  } catch (e: any) {
    console.error('[objectives]', e?.message ?? e);
    return json({ ok: false, error: 'Couldn’t save — try again.' }, 500);
  }
};

function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json' } });
}
