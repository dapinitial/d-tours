import type { APIRoute } from 'astro';
import { supabaseServer, authConfigured } from '../../lib/supabaseServer';

export const prerender = false;

// Create the signed-in user's first trip: provision_trip() atomically makes their
// tenant + owner crew row and clones the Seattle/PNW template. Idempotent at the DB
// level — a user who already owns a trip just gets it back.
export const POST: APIRoute = async ({ request, cookies }) => {
  if (!authConfigured) return json({ ok: false, error: 'auth not configured' }, 503);
  const sb = supabaseServer(cookies, request.headers);
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return json({ ok: false, error: 'not authenticated' }, 401);

  let body: any = {};
  try { body = await request.json(); } catch {}
  const name = String(body.name ?? '').slice(0, 80).trim();
  const intent = String(body.intent ?? '').slice(0, 400).trim();
  if (!name) return json({ ok: false, error: 'Give your trip a name.' }, 400);

  const { data, error } = await sb.rpc('provision_trip', { p_intent: intent || null, p_name: name });
  if (error) {
    console.error('[provision]', error.message);
    return json({ ok: false, error: 'Could not create your trip — try again.' }, 500);
  }
  const row = Array.isArray(data) ? data[0] : data;
  return json({ ok: true, slug: row?.slug ?? null });
};

function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json' } });
}
