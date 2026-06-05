import type { APIRoute } from 'astro';
import { getSupabaseAdmin } from '../../lib/supabase';
import { getDefaultTenant } from '../../lib/data';

export const prerender = false;

// Co-pilot picks: a follower suggests music or an audiobook for the drive.
// Mock-safe; owner-moderated before it shows publicly (status pending).
export const POST: APIRoute = async ({ request }) => {
  let title = '', url = '', kind = 'music', by = '';
  try { ({ title = '', url = '', kind = 'music', by = '' } = await request.json()); } catch {}
  title = String(title).slice(0, 120).trim();
  if (!title) return json({ ok: false, error: 'Name a track, album, or audiobook.' }, 400);
  if (!['music', 'audiobook', 'podcast'].includes(kind)) kind = 'music';

  const sb = getSupabaseAdmin();
  const tid = sb ? ((await getDefaultTenant())?.id ?? null) : null;
  const row = {
    title,
    url: String(url).slice(0, 300) || null,
    kind,
    suggested_by: String(by).slice(0, 60) || 'a follower',
    status: 'pending' as const,
    tenant_id: tid,
  };

  if (!sb) return json({ ok: true, mock: true, ...row });

  const { error } = await sb.from('playlist_suggestions').insert(row);
  if (error) { console.error('[playlist]', error.message); return json({ ok: false, error: 'Couldn’t add that — try again.' }, 500); }
  return json({ ok: true });
};

function json(d: unknown, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });
}
