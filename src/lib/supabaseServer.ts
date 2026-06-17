import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import type { AstroCookies } from 'astro';

// Per-request Supabase client backed by cookies, so middleware/pages can read the
// signed-in user's session and RLS sees their JWT. Uses the publishable key.
const url = import.meta.env.PUBLIC_SUPABASE_URL ?? process.env.PUBLIC_SUPABASE_URL;
const key =
  import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.PUBLIC_SUPABASE_ANON_KEY ??
  process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.PUBLIC_SUPABASE_ANON_KEY;

export const authConfigured = Boolean(url && key);

export function supabaseServer(cookies: AstroCookies, headers: Headers) {
  // Share the auth cookie across the apex + www so the magic-link flow survives a host
  // hop (sign up on shotgundetour.com, callback on www.shotgundetour.com, or vice versa).
  // On the DO proxy the real public host is in x-forwarded-host (host is "localhost").
  const host = (headers.get('x-forwarded-host') || headers.get('host') || '').split(',')[0].split(':')[0].trim();
  const domain = host.endsWith('shotgundetour.com') ? '.shotgundetour.com' : undefined;
  return createServerClient(url!, key!, {
    cookieOptions: domain ? { domain } : undefined,
    cookies: {
      // Use @supabase/ssr's own parser so the encoding matches the browser client
      // exactly. A hand-rolled decodeURIComponent parser corrupted the chunked
      // base64 auth cookie, so the session was unreadable on the request AFTER login
      // — that was the post-login "bounce back to sign-in" bug.
      getAll() {
        return parseCookieHeader(headers.get('cookie') ?? '').map((c) => ({ name: c.name, value: c.value ?? '' }));
      },
      setAll(toSet) {
        toSet.forEach(({ name, value, options }) => {
          try { cookies.set(name, value, options as any); } catch { /* headers already sent */ }
        });
      },
    },
  });
}
