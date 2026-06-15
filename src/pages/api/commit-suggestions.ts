import type { APIRoute } from 'astro';
import { getObjective, getChapters, getStops } from '../../lib/data';
import { supabaseServer, authConfigured } from '../../lib/supabaseServer';
import { isSendDay, sendWindow, type ForecastDay } from '../../lib/weather';
import { suggestDays, type WeatherHints } from '../../lib/commitSuggest';

export const prerender = false;

// Owner-only: smart date suggestions for committing a climb. Mirrors /api/itinerary's
// requireOwner — must be a signed-in owner, scoped to their tenant.
async function requireOwner(cookies: any, headers: Headers): Promise<{ tenantId: string | null } | { error: string; status: number }> {
  if (!authConfigured) return { tenantId: null }; // local/mock dev: allow
  const supabase = supabaseServer(cookies, headers);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'not authenticated', status: 401 };
  const { data: crew } = await supabase
    .from('crew').select('tenant_id').eq('email', user.email).eq('is_owner', true).maybeSingle();
  if (!crew) return { error: 'not an owner', status: 403 };
  return { tenantId: crew.tenant_id };
}

const isoToday = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Per-date weather verdicts from the objective's forecast, single-sourced via weather.ts.
function weatherHints(fc?: ForecastDay[]): WeatherHints {
  if (!fc?.length) return {};
  const windowDates = new Set<string>();
  const win = sendWindow(fc);
  if (win) {
    const i = fc.findIndex((d) => d.date === win.start);
    for (let k = i; k >= 0 && k < i + win.len && k < fc.length; k++) windowDates.add(fc[k].date.slice(0, 10));
  }
  const sendDates = new Set(fc.filter(isSendDay).map((d) => d.date.slice(0, 10)));
  const badDates = new Set(fc.filter((d) => d.precip_prob >= 60 || d.wind >= 30 || d.code >= 61).map((d) => d.date.slice(0, 10)));
  return { windowDates, sendDates, badDates };
}

export const GET: APIRoute = async ({ request, cookies, url }) => {
  const auth = await requireOwner(cookies, request.headers);
  if ('error' in auth) return json({ ok: false, error: auth.error }, auth.status);
  const tid = auth.tenantId;

  const objectiveId = url.searchParams.get('objective');
  if (!objectiveId) return json({ ok: false, error: 'missing objective' }, 400);

  const obj = await getObjective(objectiveId);
  if (!obj) return json({ ok: false, error: 'objective not found' }, 404);
  // Tenant guard: never suggest across someone else's trip.
  if (tid && (obj as any).tenant_id && (obj as any).tenant_id !== tid) {
    return json({ ok: false, error: 'forbidden' }, 403);
  }

  const [chapters, stops] = await Promise.all([
    getChapters(tid ?? undefined),
    getStops(tid ?? undefined),
  ]);

  const fc: ForecastDay[] | undefined = (obj as any).beta?.conditions?.forecast?.days;
  const { suggestions, fallbackManual } = suggestDays({
    objective: { name: obj.name, region: obj.region, day_type: obj.day_type ?? null },
    chapters,
    stops,
    today: isoToday(),
    weather: weatherHints(fc),
  });

  return json({ ok: true, suggestions, fallbackManual });
};

function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json' } });
}
