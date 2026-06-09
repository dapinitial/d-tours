import type { APIRoute } from 'astro';
import { getObjectives } from '../../lib/data';
import { getSupabaseAdmin } from '../../lib/supabase';
import { getLivePosition, haversineMi, driveHours } from '../../lib/proximity';
import { notify } from '../../lib/notifier';
import { siteUrl } from '../../lib/site';

export const prerender = false;

// 🧠 Local-brain bridge. The cloud watcher is the always-on TRIPWIRE; the SMART
// recommendation runs on David's laptop via Claude Max (headless `claude -p`), online
// via Starlink. This endpoint is the data plane for that local script (bin/shotgun-brief.mjs):
//   GET  /api/brief?token=…&hours=4      → assembled context JSON (NO side effects)
//   POST /api/brief?token=…  {text,ids}  → email the finished brief (+ optionally mark alerted)
// Token-gated with WATCH_TOKEN, same as the watcher. No ANTHROPIC_API_KEY needed —
// the reasoning happens on the laptop's Max plan, not here.

function gate(request: Request, url: URL): boolean {
  const token = process.env.WATCH_TOKEN;
  if (!token) return true; // open in local/dev when unset
  const auth = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? url.searchParams.get('token') ?? '';
  return auth === token;
}

export const GET: APIRoute = async ({ request, url }) => {
  if (!gate(request, url)) return json({ ok: false, error: 'unauthorized' }, 401);
  const hours = Number(url.searchParams.get('hours') ?? 4);

  const pos = await getLivePosition();
  if (!pos || pos.mock) return json({ ok: true, skipped: 'no live position', candidates: [] });

  // Every in-range climb (a day's options — not just un-alerted), nearest first.
  const objectives = await getObjectives(undefined, { includeProposed: true });
  const candidates = objectives
    .filter((o) => typeof o.lat === 'number' && typeof o.lng === 'number')
    .map((o) => {
      const mi = haversineMi(pos.lat, pos.lng, o.lat as number, o.lng as number);
      return { o, miles: Math.round(mi), hrs: Math.round(driveHours(mi) * 10) / 10 };
    })
    .filter((c) => c.hrs <= hours)
    .sort((a, b) => a.miles - b.miles);

  const sb = getSupabaseAdmin();
  let recent: { title: string; when: string | null }[] = [];
  if (sb) {
    try {
      const { data } = await sb.from('posts').select('title, created_at').order('created_at', { ascending: false }).limit(5);
      recent = (data ?? []).map((p: any) => ({ title: p.title, when: p.created_at ? String(p.created_at).slice(0, 10) : null }));
    } catch {}
  }
  const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const wdIdx = new Date(Date.now() - 7 * 3600 * 1000).getUTCDay(); // ≈ Mountain-local day
  const origin = siteUrl(request);

  return json({
    ok: true,
    position: pos,
    weekday: WD[wdIdx],
    isWeekend: wdIdx === 0 || wdIdx === 6,
    recent,
    candidates: candidates.map((c) => ({
      id: c.o.id, name: c.o.name, grade: c.o.grade, region: c.o.region,
      dayType: c.o.day_type ?? null, discipline: c.o.discipline ?? null,
      hrs: c.hrs, miles: c.miles, hazard: c.o.hazard ?? null, severity: c.o.severity ?? null,
      status: c.o.status ?? null, signal: c.o.beta?.signal ?? null, alerted: !!(c.o as any).alerted_at,
      forecast: (c.o.beta?.conditions?.forecast?.days ?? []).slice(0, 3).map((d: any) => ({
        date: d.date, tmax: d.tmax, tmin: d.tmin, precipProb: d.precip_prob, wind: d.wind,
      })),
      url: `${origin}/objectives/${c.o.id}`,
    })),
  });
};

export const POST: APIRoute = async ({ request, url }) => {
  if (!gate(request, url)) return json({ ok: false, error: 'unauthorized' }, 401);
  let body: any = {};
  try { body = await request.json(); } catch {}
  const text = String(body?.text ?? '').trim();
  if (!text) return json({ ok: false, error: 'no text' }, 400);
  const subject = String(body?.subject ?? '🛰️ Shotgun’s morning call').slice(0, 160);
  const ids: string[] = Array.isArray(body?.ids) ? body.ids : []; // optional: suppress the cloud tripwire for these

  try { await notify({ subject, body: text, short: subject }); } catch (e: any) { console.error('[brief.send]', e?.message ?? e); }

  const sb = getSupabaseAdmin();
  if (sb && ids.length) {
    try { await sb.from('objectives').update({ alerted_at: new Date().toISOString() }).in('id', ids); } catch {}
  }
  return json({ ok: true, sent: true, marked: ids.length });
};

function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json' } });
}
