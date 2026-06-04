import type { APIRoute } from 'astro';
import { getSupabaseAdmin } from '../../lib/supabase';

export const prerender = false;

// Increment a post's like count. Open (no auth) for likes — comments are the
// gated thing. With no Supabase configured this no-ops successfully so the
// optimistic UI stays happy in mock mode.
export const POST: APIRoute = async ({ request }) => {
  let post: string | undefined;
  try { ({ post } = await request.json()); } catch {}
  if (!post) return json({ ok: false, error: 'missing post' }, 400);

  const sb = getSupabaseAdmin();
  if (!sb) return json({ ok: true, mock: true });

  const { error } = await sb.rpc('increment_like', { p_post_id: post });
  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true });
};

function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json' } });
}
