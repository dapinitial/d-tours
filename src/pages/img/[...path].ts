import type { APIRoute } from 'astro';

export const prerender = false;

// 🖼️ Image proxy. Serves Supabase Storage media THROUGH our own domain so images
// load even on networks whose DNS blocks supabase.co (campground/cafe/filtered wifi —
// the same block that broke magic-link login). The DO server can always reach
// Supabase, so it fetches upstream and streams the bytes back, cached hard. Combined
// with on-upload resize, the payload is small, so proxying cost is negligible.
//   /img/<tenant>/<file>.jpg  →  <supabase>/storage/v1/object/public/media/<...>

const SUPA = (process.env.PUBLIC_SUPABASE_URL ?? import.meta.env.PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');

export const GET: APIRoute = async ({ params }) => {
  const path = params.path ?? '';
  if (!path || path.includes('..') || !SUPA) return new Response('bad request', { status: 400 });
  try {
    const upstream = await fetch(`${SUPA}/storage/v1/object/public/media/${path}`);
    if (!upstream.ok) return new Response('not found', { status: upstream.status });
    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': upstream.headers.get('content-type') ?? 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return new Response('upstream error', { status: 502 });
  }
};
