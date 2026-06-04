import type { APIRoute } from 'astro';

export const prerender = false;

// Polls the Garmin inReach MapShare Raw KML feed and returns the latest point.
// No feed configured → returns a mock position so the live map still renders.
export const GET: APIRoute = async () => {
  const feed = process.env.MAPSHARE_FEED_URL;
  if (!feed) {
    return json({ mock: true, lat: 42.7, lng: -109.2, when: 'mock · Cirque of the Towers' });
  }
  try {
    const res = await fetch(feed);
    const kml = await res.text();
    const point = parseLatestPoint(kml);
    if (!point) return json({ error: 'no point in feed' }, 404);
    return json({ mock: false, ...point });
  } catch (e: any) {
    return json({ error: e?.message ?? 'fetch failed' }, 502);
  }
};

export const POST = GET; // CMS button uses POST

// Minimal KML scrape: grab the last <coordinates> lon,lat[,alt].
function parseLatestPoint(kml: string): { lat: number; lng: number; when?: string } | null {
  const matches = [...kml.matchAll(/<coordinates>\s*([-\d.]+),([-\d.]+)/g)];
  if (!matches.length) return null;
  const last = matches[matches.length - 1];
  const when = kml.match(/<when>([^<]+)<\/when>/g)?.pop()?.replace(/<\/?when>/g, '');
  return { lng: parseFloat(last[1]), lat: parseFloat(last[2]), when };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
