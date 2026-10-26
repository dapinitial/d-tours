import type { APIRoute } from 'astro';
import { getSupabaseAdmin } from '../../lib/supabase';
import { guard } from '../../lib/ratelimit';

export const prerender = false;

// Increment a post's like count. Open (no auth) for likes — comments are the
// gated thing. With no Supabase configured this no-ops successfully so the
// optimistic UI stays happy in mock mode.
export const POST: APIRoute = async ({ request }) => {
  // open to everyone, so a script could inflate any count: a few likes a minute per visitor
  const limited = guard(request, 'like', { capacity: 10, refillPerSec: 1 / 6 });
  if (limited) return limited;
  let post: string | undefined;
  try { ({ post } = await request.json()); } catch {}
  if (!post) return json({ ok: false, error: 'missing post' }, 400);

  const sb = getSupabaseAdmin();
  if (!sb) return json({ ok: true, mock: true });

  const { error } = await sb.rpc('increment_like', { p_post_id: post });
  if (error) {
    // an unknown post is the visitor's mistake, not ours; and the database's own words stay in the log
    if (/not found|does not exist|no rows|foreign key|invalid input syntax/i.test(error.message)) return json({ ok: false, error: 'no such post' }, 404);
    console.error('[like]', error.message);
    return json({ ok: false, error: 'could not save that like' }, 500);
  }
  return json({ ok: true });
};

function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json' } });
}
