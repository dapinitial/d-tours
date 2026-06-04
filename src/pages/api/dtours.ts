import type { APIRoute } from 'astro';
import { lookAhead } from '../../lib/dtours/overpass';

export const prerender = false;

// Live D-Tours look-ahead: query OSM around a position for the next stretch.
// Defaults to the Winds; pass ?lat=&lng= to scout elsewhere. Proves the loop
// against a real, key-free data source.
export const POST: APIRoute = async ({ url }) => {
  const lat = Number(url.searchParams.get('lat') ?? 42.7);
  const lng = Number(url.searchParams.get('lng') ?? -109.2);
  const found = await lookAhead({ lat, lng, radiusM: 25000, categories: ['water', 'fuel', 'camp', 'fitness', 'track'] });
  return new Response(JSON.stringify({ at: { lat, lng }, count: found.length, detours: found }, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const GET = POST;
