import type { APIRoute } from 'astro';
import { getStops } from '../../lib/data';
import { getDetours } from '../../lib/data';
import { composeDigest } from '../../lib/dtours/digest';
import { notify } from '../../lib/notifier';

export const prerender = false;

// Compose today's Shotgun digest and (try to) send it. Returns the composed
// message + per-channel delivery results. With no SMTP/iMessage configured it
// still composes — you see exactly what Shotgun *would* send.
export const POST: APIRoute = async () => {
  const stops = await getStops();
  const detours = await getDetours();
  const today = stops[0];
  const next = stops[1];
  const hardDeadline = stops.find((s) => s.flex === 'hard');
  const msg = composeDigest({ today, next, hardDeadline, detours, sittingHours: 3 });
  const delivery = await notify(msg);
  return new Response(JSON.stringify({ composed: msg, delivery }, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const GET = POST;
