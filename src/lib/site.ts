// The site's PUBLIC base URL, for building links in outbound emails (watcher,
// send-window alerts, digest). DO NOT derive this from `new URL(request.url).origin`:
// behind DigitalOcean App Platform's proxy the app sees the INTERNAL host (localhost),
// so links came out as https://localhost/... — the same proxy quirk that broke
// Astro's CSRF origin check (see security.checkOrigin:false). Resolve order:
//   1. PUBLIC_SITE_URL env (authoritative; set this in prod/dev to override)
//   2. the request origin — but ONLY if it's a real public host, not localhost/LAN
//   3. the known production domain
const PROD = 'https://www.shotgundetour.com';

function isInternal(host: string): boolean {
  return /^(localhost|127\.|0\.0\.0\.0|::1|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)
    || host.endsWith('.internal') || host.endsWith('.local');
}

export function siteUrl(req?: Request): string {
  const env = (process.env.PUBLIC_SITE_URL ?? import.meta.env.PUBLIC_SITE_URL ?? '').replace(/\/+$/, '');
  if (env) return env;
  if (req) {
    try {
      const u = new URL(req.url);
      if (u.protocol.startsWith('http') && !isInternal(u.hostname)) return u.origin;
    } catch { /* fall through */ }
  }
  return PROD;
}
