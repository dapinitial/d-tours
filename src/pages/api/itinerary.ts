import type { APIRoute } from 'astro';
import { getSupabaseAdmin } from '../../lib/supabase';

export const prerender = false;

// Mutate the itinerary on the fly — the engine behind "add pit-stops/side-quests
// without a deploy." Stop data lives in Supabase; writes reflect on the next page
// load (no rebuild). In mock mode it echoes success so the UI flow is testable.
//
// POST body: { action, stop?, id? }
//   action: 'add'      → stage/insert a stop (status defaults from payload)
//           'promote'  → flip proposed/suggested → confirmed (David's 👍)
//           'decline'  → flip → declined
//           'update'   → patch fields
//           'remove'   → delete
export const POST: APIRoute = async ({ request }) => {
  let payload: any = {};
  try { payload = await request.json(); } catch {}
  const { action, stop, id } = payload;
  if (!action) return json({ ok: false, error: 'missing action' }, 400);

  const sb = getSupabaseAdmin();
  if (!sb) {
    // mock: pretend it worked so the on-the-fly flow is demonstrable
    return json({ ok: true, mock: true, action, id: id ?? stop?.id });
  }

  try {
    switch (action) {
      case 'add':
        await sb.from('stops').upsert(stop);
        return json({ ok: true, action, id: stop?.id });
      case 'promote':
        await sb.from('stops').update({ status: 'confirmed' }).eq('id', id);
        return json({ ok: true, action, id });
      case 'decline':
        await sb.from('stops').update({ status: 'declined' }).eq('id', id);
        return json({ ok: true, action, id });
      case 'update':
        await sb.from('stops').update(stop).eq('id', id ?? stop?.id);
        return json({ ok: true, action, id: id ?? stop?.id });
      case 'remove':
        await sb.from('stops').delete().eq('id', id);
        return json({ ok: true, action, id });
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
