import type { APIRoute } from 'astro';
import { getSupabaseAdmin } from '../../lib/supabase';

export const prerender = false;

// A follower suggests a detour/stop. Lands in the `suggestions` table as
// `pending` → shows up in your CMS queue → you approve the good ones into the
// itinerary. Public-facing, so keep it small + sanitized. Mock-safe.
export const POST: APIRoute = async ({ request }) => {
  let title = '', location = '', note = '', by = '';
  try { ({ title = '', location = '', note = '', by = '' } = await request.json()); } catch {}
  title = String(title).slice(0, 120).trim();
  if (!title) return json({ ok: false, error: 'What should Shotgun check out?' }, 400);

  const row = {
    title,
    location: String(location).slice(0, 120) || null,
    note: String(note).slice(0, 280) || null,
    suggested_by: String(by).slice(0, 60) || 'a follower',
    status: 'pending' as const,
  };

  const sb = getSupabaseAdmin();
  if (!sb) return json({ ok: true, mock: true, ...row });

  const { error } = await sb.from('suggestions').insert(row);
  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true });
};

function json(d: unknown, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });
}
