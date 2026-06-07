import type { APIRoute } from 'astro';
import { getStops, getDetours, getSubscribers } from '../../lib/data';
import { composeDigest } from '../../lib/dtours/digest';
import { notify } from '../../lib/notifier';
import { sendRaw } from '../../lib/notifier/email';
import { supabaseServer, authConfigured } from '../../lib/supabaseServer';

export const prerender = false;

// Triggering a digest fans out to the subscriber list, so gate it: an owner
// session (the CMS button) OR a cron token (DIGEST_TOKEN for the home-iMac job).
async function authorized(cookies: any, headers: Headers, url: URL): Promise<boolean> {
  if (!authConfigured) return true; // local/mock
  // Cron token via ?token= or Authorization: Bearer — accepts DIGEST_TOKEN or WATCH_TOKEN.
  const provided = headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? url.searchParams.get('token') ?? '';
  const tokens = [process.env.DIGEST_TOKEN, process.env.WATCH_TOKEN].filter(Boolean) as string[];
  if (provided && tokens.includes(provided)) return true;
  const sb = supabaseServer(cookies, headers);
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return false;
  const { data: crew } = await sb.from('crew').select('tenant_id').eq('email', user.email).eq('is_owner', true).maybeSingle();
  return !!crew;
}

// Compose today's Shotgun digest, notify David's own channels, AND email the
// subscriber list (the "Get the dispatch" sign-ups — previously a dead inbox).
// Pass ?cadence=daily|weekly to target a segment; omit to send to everyone.
// Composes regardless of SMTP config so you always see what it WOULD send.
export const POST: APIRoute = async ({ url, cookies, request }) => {
  if (!(await authorized(cookies, request.headers, url))) return json({ ok: false, error: 'not authorized' }, 401);
  const cadence = url.searchParams.get('cadence') ?? undefined;
  const stops = await getStops();
  const detours = await getDetours();
  const msg = composeDigest({
    today: stops[0], next: stops[1],
    hardDeadline: stops.find((s) => s.flex === 'hard'),
    detours, sittingHours: 3,
  });

  const delivery = await notify(msg); // David's own channels (iMessage → email → …)

  // Fan out to subscribers.
  const subs = await getSubscribers(undefined, cadence);
  const results = await Promise.allSettled(subs.map((s) => sendRaw(s.email, msg.subject, msg.body)));
  const sent = results.filter((r) => r.status === 'fulfilled' && (r.value as any)?.ok).length;

  return json({
    composed: msg,
    delivery,
    subscribers: { total: subs.length, sent, note: sent === 0 && subs.length > 0 ? 'set SMTP_HOST/USER/PASS to actually send' : undefined },
  });
};

export const GET = POST;

function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d, null, 2), { status, headers: { 'Content-Type': 'application/json' } });
}
