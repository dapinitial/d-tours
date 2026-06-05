import type { APIRoute } from 'astro';
import { getSupabaseAdmin } from '../../lib/supabase';
import { getDefaultTenant } from '../../lib/data';

export const prerender = false;

// Follower subscribes to Shotgun's recap (daily or weekly). Stored in Supabase;
// the home-iMac digest job emails the list at Tier 2. Mock-safe (echoes success).
export const POST: APIRoute = async ({ request }) => {
  let email = '', cadence = 'weekly';
  try { ({ email, cadence = 'weekly' } = await request.json()); } catch {}
  if (!email || !/^.+@.+\..+$/.test(email)) return json({ ok: false, error: 'A valid email, please.' }, 400);
  if (!['daily', 'weekly'].includes(cadence)) cadence = 'weekly';

  const sb = getSupabaseAdmin();
  if (!sb) return json({ ok: true, mock: true, email, cadence });

  const tid = (await getDefaultTenant())?.id ?? null;
  const { error } = await sb.from('subscribers')
    .upsert({ email, cadence, tenant_id: tid }, { onConflict: 'tenant_id,email' });
  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true, cadence });
};

function json(d: unknown, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });
}
