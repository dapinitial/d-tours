// 📦 Offline-packet helpers — shared by /api/packet-manifest, /packet, and the
// objective dossier page. Two jobs:
//   1. Rewrite remote field-guide photos (Wikimedia) through our first-party
//      /extimg proxy so the service worker can cache them offline (it skips
//      cross-origin requests by design).
//   2. Collect every cacheable image URL for an objective so the manifest and
//      the rendered page agree on exactly the same first-party URLs.
import type { Objective } from './types';

/** Hosts /extimg is allowed to proxy: Wikimedia (field-guide photos) + YouTube's
 *  thumbnail CDN (skill thumbnails). A tight allow-list so /extimg can't become an
 *  open proxy. Everything else is rejected. */
export const EXTIMG_HOSTS = [
  'upload.wikimedia.org',
  'commons.wikimedia.org',
  'en.wikipedia.org',
  'wikipedia.org',
  'img.youtube.com',
  'i.ytimg.com',
];

export function isProxyableExtImage(raw?: string | null): boolean {
  if (!raw) return false;
  try {
    const h = new URL(raw).hostname.toLowerCase();
    return EXTIMG_HOSTS.some((allowed) => h === allowed || h.endsWith('.' + allowed));
  } catch {
    return false;
  }
}

/** Rewrite an allow-listed remote image URL to our first-party /extimg proxy so
 *  it loads on DNS-filtered networks AND caches offline. Pass-through otherwise
 *  (already first-party /img URLs, data URIs, or non-allow-listed hosts). */
export function extImg(raw?: string | null): string {
  if (!raw) return '';
  return isProxyableExtImage(raw) ? `/extimg?u=${encodeURIComponent(raw)}` : raw;
}

const YT_RE = /(?:youtu\.be\/|[?&]v=|embed\/|shorts\/)([\w-]{11})/;

/** YouTube thumbnail for a skill's video, routed first-party through /extimg so it
 *  loads on DNS-filtered networks AND caches offline (the video itself can't — see
 *  the packet spec). Keeps the skills library browsable/identifiable without signal. */
export function ytThumb(videoUrl?: string | null): string | null {
  const id = videoUrl?.match(YT_RE)?.[1];
  return id ? extImg(`https://img.youtube.com/vi/${id}/hqdefault.jpg`) : null;
}

/** Every image URL worth caching for one objective dossier, as first-party (or
 *  pass-through) URLs. Dossier photos are already /img; field-guide photos get
 *  routed through /extimg. De-duped, falsy stripped. */
export function objectiveImageUrls(obj: Objective): string[] {
  const b: any = obj.beta ?? {};
  const urls: string[] = [];
  // Must match exactly what the dossier page renders (both run through extImg),
  // or the precached URL won't be the one the <img> requests offline.
  for (const p of b.photos ?? []) if (p?.url) urls.push(extImg(p.url));
  for (const f of b.field_guide ?? []) if (f?.photo) urls.push(extImg(f.photo));
  return [...new Set(urls.filter(Boolean))];
}
