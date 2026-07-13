import type { APIRoute } from 'astro';
import { getStops, getDetours, getSubscribers } from '../../lib/data';
import { composeDigest } from '../../lib/dtours/digest';
import { notify } from '../../lib/notifier';
import { sendRaw } from '../../lib/notifier/email';
import { supabaseServer, authConfigured } from '../../lib/supabaseServer';
import { getSupabaseAdmin } from '../../lib/supabase';
import { localHourInTz, localDayInTz } from '../../lib/notify-schedule';

export const prerender = false;

// How the request is authorized decides whether the schedule gate applies:
//  · owner session (CMS "send now")  → send immediately, no gate
//  · cron token (hourly pg_cron tick) → gated: only sends to a trip when its local
//    time == digest_hour and it hasn't gone out yet today
//  · ?force=1 with a token            → send immediately (manual cron/debug)
async function classify(cookies: any, headers: Headers, url: URL): Promise<'owner' | 'cron' | null> {
  if (!authConfigured) return 'owner'; // local/mock — behave like a manual send
  const provided = headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? url.searchParams.get('token') ?? '';
  const tokens = [process.env.DIGEST_TOKEN, process.env.WATCH_TOKEN].filter(Boolean) as string[];
  if (provided && tokens.includes(provided)) return 'cron';
  const sb = supabaseServer(cookies, headers);
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data: crew } = await sb.from('crew').select('tenant_id').eq('email', user.email).eq('is_owner', true).maybeSingle();
  return crew ? 'owner' : null;
}

// Compose today's Shotgun digest, notify David's own channels, AND email the
// subscriber list. Composes regardless of SMTP config so you always see what it WOULD send.
async function sendDigest(cadence: string | undefined) {
  const stops = await getStops();
  const detours = await getDetours();
  const msg = composeDigest({
    today: stops[0], next: stops[1],
    hardDeadline: stops.find((s) => s.flex === 'hard'),
    detours, sittingHours: 3,
  });
  const delivery = await notify(msg); // David's own channels (iMessage → email → …)
  const subs = await getSubscribers(undefined, cadence);
  const results = await Promise.allSettled(subs.map((s) => sendRaw(s.email, msg.subject, msg.body)));
  const sent = results.filter((r) => r.status === 'fulfilled' && (r.value as any)?.ok).length;
  return {
    composed: msg, delivery,
    subscribers: { total: subs.length, sent, note: sent === 0 && subs.length > 0 ? 'set SMTP_HOST/USER/PASS to actually send' : undefined },
  };
}

export const POST: APIRoute = async ({ url, cookies, request }) => {
  const who = await classify(cookies, request.headers, url);
  if (!who) return json({ ok: false, error: 'not authorized' }, 401);
  const cadence = url.searchParams.get('cadence') ?? undefined;
  const force = url.searchParams.get('force') === '1';

  // Send now, no daily-schedule gate:
  //  · owner (CMS "send now") or ?force=1 → manual
  //  · cadence=weekly → the weekly recap keeps its own cron cadence (fires Sunday);
  //    only the DAILY digest is governed by digest_hour/digest_enabled.
  if (who === 'owner' || force || cadence === 'weekly') return json(await sendDigest(cadence));

  // Daily cron tick: send only if the trip's local hour matches its digest_hour and today's
  // digest hasn't gone out. Gated on the default tenant — whose trip the digest composes.
  const sb = getSupabaseAdmin();
  if (!sb) return json(await sendDigest(cadence)); // mock/no-admin: behave as before

  const { data: t } = await sb.from('tenants')
    .select('id, digest_enabled, digest_hour, digest_tz, last_digest_on')
    .eq('is_default', true).maybeSingle();
  if (!t) return json({ ok: true, skipped: 'no default tenant' });
  if (!t.digest_enabled) return json({ ok: true, skipped: 'digest disabled' });

  const tz = t.digest_tz || 'America/Chicago';
  const hour = localHourInTz(tz);
  const day = localDayInTz(tz);
  if (hour !== t.digest_hour) return json({ ok: true, skipped: 'not the hour', local_hour: hour, want: t.digest_hour, tz });
  if (t.last_digest_on === day) return json({ ok: true, skipped: 'already sent today', day });

  // Stamp BEFORE sending so a slow send + overlapping tick can't double-fire.
  await sb.from('tenants').update({ last_digest_on: day }).eq('id', t.id);
  return json({ ...(await sendDigest(cadence)), scheduled: { tz, hour, day } });
};

export const GET = POST;

function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d, null, 2), { status, headers: { 'Content-Type': 'application/json' } });
}
