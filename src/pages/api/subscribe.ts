import type { APIRoute } from 'astro';
import { getSupabaseAdmin } from '../../lib/supabase';
import { getDefaultTenant } from '../../lib/data';
import { sendRaw } from '../../lib/notifier/email';

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
  if (error) { console.error('[subscribe]', error.message); return json({ ok: false, error: 'Couldn’t save that — try again in a moment.' }, 500); }

  // Welcome / confirmation email (best-effort — never fail the subscribe on it).
  try {
    await sendRaw(
      email,
      "You're on the list 🚐 — D-Tours dispatch",
      `You're in! Shotgun will send you the ${cadence} highlights from the Austin → Squamish climbing road trip — where we are, what we climbed, the weird detours, and the mixtape.\n\nFollow along: https://shotgundetour.com\n\nSee you on the road. 🧗\n— Shotgun`,
    );
  } catch {}

  return json({ ok: true, cadence });
};

function json(d: unknown, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });
}
