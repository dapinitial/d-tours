import type { APIRoute } from 'astro';
import { getObjectives } from '../../lib/data';
import { getSupabaseAdmin } from '../../lib/supabase';
import { getLivePosition, haversineMi, driveHours } from '../../lib/proximity';
import { notify } from '../../lib/notifier';
import { siteUrl } from '../../lib/site';
import { smartBrief } from '../../lib/brief';

export const prerender = false;

// 🛰️ The proactive watcher. A cron pings this every ~30-60 min. It reads David's
// live position, finds awesome climbs within N hours' drive that he hasn't been
// pinged about, emails him the dossier links, and marks them so he isn't spammed.
// Token-gated (WATCH_TOKEN) so only the cron can trigger it. Skips on mock/no GPS.
//   POST /api/watch?hours=3   (Authorization: Bearer <WATCH_TOKEN>  OR  ?token=)

export const POST: APIRoute = async ({ request, url }) => {
  // Gate
  const token = process.env.WATCH_TOKEN;
  if (token) {
    const auth = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? url.searchParams.get('token') ?? '';
    if (auth !== token) return json({ ok: false, error: 'unauthorized' }, 401);
  }

  const hours = Number(url.searchParams.get('hours') ?? 3);

  // Where is David? Skip if no live GPS (don't fire on the mock position).
  const pos = await getLivePosition();
  if (!pos || pos.mock) return json({ ok: true, skipped: 'no live position', mock: pos?.mock ?? null });

  // Awesome climbs within range that we haven't pinged about yet.
  const objectives = await getObjectives(undefined, { includeProposed: true });
  const candidates = objectives
    .filter((o) => typeof o.lat === 'number' && typeof o.lng === 'number' && !(o as any).alerted_at)
    .map((o) => {
      const mi = haversineMi(pos.lat, pos.lng, o.lat as number, o.lng as number);
      return { o, miles: Math.round(mi), hrs: Math.round(driveHours(mi) * 10) / 10 };
    })
    .filter((c) => c.hrs <= hours)
    .sort((a, b) => a.miles - b.miles);

  if (!candidates.length) return json({ ok: true, position: pos, alerted: 0 });

  const sb = getSupabaseAdmin();

  // Dossier links. Use the PUBLIC site URL — behind DO's proxy `request.url` is the
  // internal host, which used to give localhost links.
  const origin = siteUrl(request);
  const lines = candidates.map((c) => {
    const tag = c.o.status === 'proposed' ? ' (a swap we\'re weighing)' : '';
    return `🧗 ${c.o.name} — ${c.o.grade} · ~${c.hrs}h away${tag}\n   ${origin}/objectives/${c.o.id}`;
  });
  const subject = candidates.length === 1
    ? `🛰️ You're ~${candidates[0].hrs}h from ${candidates[0].o.name}`
    : `🛰️ ${candidates.length} awesome climbs within ${hours}h of you`;

  // 🧠 Smart brief: turn the bare list into a real recommendation — weather window,
  // crag-vs-alpine fit for the day, rest signal, drive/spice. Falls back to the plain
  // list if ANTHROPIC_API_KEY is unset or the call errors, so the alert never blocks.
  let recent: { title: string; when?: string | null }[] = [];
  if (sb) {
    try {
      const { data } = await sb.from('posts').select('title, created_at').order('created_at', { ascending: false }).limit(4);
      recent = (data ?? []).map((p: any) => ({ title: p.title, when: p.created_at ? String(p.created_at).slice(0, 10) : null }));
    } catch {}
  }
  const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const wdIdx = new Date(Date.now() - 7 * 3600 * 1000).getUTCDay(); // ≈ Mountain-local day
  const brief = await smartBrief({
    weekday: WD[wdIdx], isWeekend: wdIdx === 0 || wdIdx === 6, whenFix: pos.when ?? null, recent,
    candidates: candidates.map((c) => ({
      name: c.o.name, grade: c.o.grade, dayType: c.o.day_type ?? null, discipline: c.o.discipline ?? null,
      hrs: c.hrs, miles: c.miles, hazard: c.o.hazard ?? null, severity: c.o.severity ?? null,
      status: c.o.status ?? null, signal: c.o.beta?.signal ?? null,
      forecast: (c.o.beta?.conditions?.forecast?.days ?? []).slice(0, 3).map((d: any) => ({
        date: d.date, tmax: d.tmax, tmin: d.tmin, precipProb: d.precip_prob, wind: d.wind,
      })),
    })),
  });

  const body = brief
    ? `${brief}\n\n— — —\n${lines.join('\n\n')}`
    : `Rolling near some good stuff${pos.when ? ` (last fix: ${pos.when})` : ''}:\n\n${lines.join('\n\n')}\n\nWant it? It's already in your dossiers.`;

  try { await notify({ subject, body, short: subject }); } catch {}

  if (sb) {
    // 📍 Log to the rolled-past feed (reviewable + requeue-able in the CMS). Best-effort.
    try {
      await sb.from('proximity_log').insert(candidates.map((c) => ({
        tenant_id: (c.o as any).tenant_id ?? null,
        objective_id: c.o.id, name: c.o.name, grade: c.o.grade,
        miles: c.miles, drive_hours: c.hrs, lat: pos.lat, lng: pos.lng, fix_at: pos.when ?? null,
      })));
    } catch {}
    // De-dup: mark these so we don't re-ping (reset via the CMS to requeue).
    try { await sb.from('objectives').update({ alerted_at: new Date().toISOString() }).in('id', candidates.map((c) => c.o.id)); } catch {}
  }

  return json({ ok: true, position: pos, alerted: candidates.length, climbs: candidates.map((c) => ({ name: c.o.name, hrs: c.hrs })) });
};

// Convenience: GET behaves the same (some cron services only do GET).
export const GET = POST;

function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json' } });
}
