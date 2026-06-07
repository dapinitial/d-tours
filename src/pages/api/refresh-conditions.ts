import type { APIRoute } from 'astro';
import { getObjectives } from '../../lib/data';
import { getSupabaseAdmin } from '../../lib/supabase';

export const prerender = false;

// 🌤️ Daily conditions refresh. A pg_cron job hits this once a day; it pulls a real
// 5-day forecast (Open-Meteo — free, global, no key) for each objective's coords and
// stores it in beta.conditions.forecast so the dossiers always show current weather.
// Token-gated (reuses WATCH_TOKEN). GET aliased for cron.

async function fetchForecast(lat: number, lng: number) {
  const u = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max` +
    `&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto&forecast_days=5`;
  const res = await fetch(u);
  if (!res.ok) return null;
  const dl = (await res.json())?.daily;
  if (!dl?.time?.length) return null;
  const days = dl.time.map((date: string, i: number) => ({
    date,
    code: dl.weather_code[i],
    tmax: Math.round(dl.temperature_2m_max[i]),
    tmin: Math.round(dl.temperature_2m_min[i]),
    precip: dl.precipitation_sum[i],
    precip_prob: dl.precipitation_probability_max[i],
    wind: Math.round(dl.wind_speed_10m_max[i]),
  }));
  return { updated_at: new Date().toISOString(), days };
}

export const POST: APIRoute = async ({ request, url }) => {
  const token = process.env.WATCH_TOKEN;
  if (token) {
    const auth = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? url.searchParams.get('token') ?? '';
    if (auth !== token) return json({ ok: false, error: 'unauthorized' }, 401);
  }

  const objectives = await getObjectives(undefined, { includeProposed: true });
  const sb = getSupabaseAdmin();
  if (!sb) return json({ ok: true, mock: true });

  let updated = 0;
  for (const o of objectives) {
    if (typeof o.lat !== 'number' || typeof o.lng !== 'number') continue;
    try {
      const f = await fetchForecast(o.lat, o.lng);
      if (!f) continue;
      const beta: any = { ...((o as any).beta ?? {}) };
      beta.conditions = { ...(beta.conditions ?? {}), forecast: f };
      const { error } = await sb.from('objectives').update({ beta }).eq('id', o.id);
      if (!error) updated++;
    } catch { /* skip this objective, keep going */ }
  }
  return json({ ok: true, updated, of: objectives.length });
};

export const GET = POST;

function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json' } });
}
