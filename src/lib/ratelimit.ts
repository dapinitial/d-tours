// In-memory rate limiting for public endpoints. Honest for the current single-instance
// deploy: per-IP token bucket + a per-key daily cap (the guard that MUST exist before
// ANTHROPIC_API_KEY is ever set, so chat can't run up a bill). State is per-process and
// resets on redeploy — graduate to Redis/Upstash when scaling past one instance.

interface Bucket { tokens: number; last: number; }
const buckets = new Map<string, Bucket>();
const daily = new Map<string, number>();

export interface LimitOpts { capacity?: number; refillPerSec?: number; now?: number; }

/** Token-bucket allow/deny. Default: burst of 8, refilling 1 token / 6s. */
export function rateLimit(key: string, opts: LimitOpts = {}): { ok: boolean; retryAfter: number } {
  const capacity = opts.capacity ?? 8;
  const refillPerSec = opts.refillPerSec ?? 1 / 6;
  const now = opts.now ?? Date.now();
  let b = buckets.get(key);
  if (!b) { b = { tokens: capacity, last: now }; buckets.set(key, b); }
  b.tokens = Math.min(capacity, b.tokens + ((now - b.last) / 1000) * refillPerSec);
  b.last = now;
  if (b.tokens >= 1) { b.tokens -= 1; return { ok: true, retryAfter: 0 }; }
  return { ok: false, retryAfter: Math.ceil((1 - b.tokens) / refillPerSec) };
}

/** Per-key daily counter (UTC day). Returns whether this hit is within `max`. */
export function dailyCap(key: string, max: number, now: number = Date.now()): { ok: boolean; count: number } {
  const day = Math.floor(now / 86_400_000);
  const k = `${key}:${day}`;
  const count = (daily.get(k) ?? 0) + 1;
  daily.set(k, count);
  if (daily.size > 5000) for (const kk of daily.keys()) { if (!kk.endsWith(`:${day}`)) daily.delete(kk); }
  return { ok: count <= max, count };
}

/** Best-effort client IP from proxy headers (DO App Platform sets x-forwarded-for). */
export function clientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

/** Guard a public endpoint by IP. Returns a 429 Response when over the limit, else null. */
export function guard(request: Request, name: string, opts: LimitOpts = {}): Response | null {
  const { ok, retryAfter } = rateLimit(`${name}:${clientIp(request)}`, opts);
  if (ok) return null;
  return new Response(JSON.stringify({ ok: false, error: 'Too many requests — slow down a moment.' }),
    { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': String(retryAfter) } });
}

// Reset hook for tests.
export function _reset() { buckets.clear(); daily.clear(); }
