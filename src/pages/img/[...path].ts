import type { APIRoute } from 'astro';

export const prerender = false;

// 🖼️ Image proxy. Serves Supabase Storage media THROUGH our own domain so images
// load even on networks whose DNS blocks supabase.co (campground/cafe/filtered wifi —
// the same block that broke magic-link login). The DO server can always reach
// Supabase, so it fetches upstream and streams the bytes back, cached hard. Combined
// with on-upload resize, the payload is small, so proxying cost is negligible.
//   /img/<tenant>/<file>.jpg  →  <supabase>/storage/v1/object/public/media/<...>

const SUPA = (process.env.PUBLIC_SUPABASE_URL ?? import.meta.env.PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');

const IMMUTABLE = 'public, max-age=31536000, immutable';

export const GET: APIRoute = async ({ params, url }) => {
  const path = params.path ?? '';
  if (!path || path.includes('..') || !SUPA) return new Response('bad request', { status: 400 });
  // ?w=<width> → resize to that width (thumbnails for map pins + gallery tiles).
  const w = Math.min(2000, Math.max(0, parseInt(url.searchParams.get('w') ?? '0', 10) || 0));
  const isGif = /\.gif$/i.test(path);
  try {
    const upstream = await fetch(`${SUPA}/storage/v1/object/public/media/${path}`);
    if (!upstream.ok) return new Response('not found', { status: upstream.status });

    // Full-size (or animated GIF) → stream straight through.
    if (!w || isGif) {
      return new Response(upstream.body, {
        status: 200,
        headers: { 'Content-Type': upstream.headers.get('content-type') ?? 'image/jpeg', 'Cache-Control': IMMUTABLE },
      });
    }
    // Resize to width w. Isolated — if sharp can't run, fall back to the original.
    try {
      const sharp = (await import('sharp')).default;
      const out = await sharp(Buffer.from(await upstream.arrayBuffer()), { failOn: 'none' })
        .rotate().resize({ width: w, withoutEnlargement: true }).jpeg({ quality: 78 }).toBuffer();
      return new Response(out, { status: 200, headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': IMMUTABLE } });
    } catch {
      const again = await fetch(`${SUPA}/storage/v1/object/public/media/${path}`);
      return new Response(again.body, { status: 200, headers: { 'Content-Type': again.headers.get('content-type') ?? 'image/jpeg', 'Cache-Control': IMMUTABLE } });
    }
  } catch {
    return new Response('upstream error', { status: 502 });
  }
};
