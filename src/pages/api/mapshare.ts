import type { APIRoute } from 'astro';
import { getLivePosition } from '../../lib/proximity';

export const prerender = false;

// Polls the Garmin inReach MapShare Raw KML feed and returns the latest point.
// No feed configured → returns a mock position so the live map still renders.
export const GET: APIRoute = async () => {
  const pos = await getLivePosition();
  if (!pos) return json({ error: 'no point in feed' }, 404);
  return json(pos);
};

export const POST = GET; // CMS button uses POST

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
