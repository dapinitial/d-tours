import type { APIRoute } from 'astro';
import { isProxyableExtImage } from '../lib/packet';

export const prerender = false;

// 🖼️ Remote-image proxy — the Wikimedia sibling of /img. Field-guide photos live
// on upload.wikimedia.org; serving them through our own domain means they (a) load
// on networks whose DNS filters block third parties and (b) cache offline, because
// the service worker deliberately skips cross-origin requests. Strictly host-gated
// (see EXTIMG_HOSTS) so it can't be abused as an open proxy.
//   /extimg?u=<encoded wikimedia url>[&w=<width>]

const IMMUTABLE = 'public, max-age=31536000, immutable';

export const GET: APIRoute = async ({ url }) => {
  const u = url.searchParams.get('u') ?? '';
  if (!isProxyableExtImage(u)) return new Response('forbidden host', { status: 400 });
  const w = Math.min(2000, Math.max(0, parseInt(url.searchParams.get('w') ?? '0', 10) || 0));
  try {
    // A descriptive UA — Wikimedia returns 403 to blank/library user agents.
    const upstream = await fetch(u, { headers: { 'User-Agent': 'D-Tours/1.0 (offline packet; shotgundetour.com)' } });
    if (!upstream.ok) return new Response('not found', { status: upstream.status });
    const ctype = upstream.headers.get('content-type') ?? 'image/jpeg';

    if (!w) {
      return new Response(upstream.body, { status: 200, headers: { 'Content-Type': ctype, 'Cache-Control': IMMUTABLE } });
    }
    // Resize — isolated; fall back to the original bytes if sharp can't run.
    try {
      const sharp = (await import('sharp')).default;
      const out = await sharp(Buffer.from(await upstream.arrayBuffer()), { failOn: 'none' })
        .rotate().resize({ width: w, withoutEnlargement: true }).jpeg({ quality: 78 }).toBuffer();
      return new Response(out, { status: 200, headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': IMMUTABLE } });
    } catch {
      const again = await fetch(u, { headers: { 'User-Agent': 'D-Tours/1.0 (offline packet; shotgundetour.com)' } });
      return new Response(again.body, { status: 200, headers: { 'Content-Type': ctype, 'Cache-Control': IMMUTABLE } });
    }
  } catch {
    return new Response('upstream error', { status: 502 });
  }
};
