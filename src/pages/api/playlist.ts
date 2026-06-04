import type { APIRoute } from 'astro';
import { getSupabaseAdmin } from '../../lib/supabase';

export const prerender = false;

// Co-pilot picks: a follower suggests music or an audiobook for the drive.
// Mock-safe; owner-moderated before it shows publicly (status pending).
export const POST: APIRoute = async ({ request }) => {
  let title = '', url = '', kind = 'music', by = '';
  try { ({ title = '', url = '', kind = 'music', by = '' } = await request.json()); } catch {}
  title = String(title).slice(0, 120).trim();
  if (!title) return json({ ok: false, error: 'Name a track, album, or audiobook.' }, 400);
  if (!['music', 'audiobook', 'podcast'].includes(kind)) kind = 'music';

  const row = {
    title,
    url: String(url).slice(0, 300) || null,
    kind,
    suggested_by: String(by).slice(0, 60) || 'a follower',
    status: 'pending' as const,
  };

  const sb = getSupabaseAdmin();
  if (!sb) return json({ ok: true, mock: true, ...row });

  const { error } = await sb.from('playlist_suggestions').insert(row);
  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true });
};

function json(d: unknown, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });
}
