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
  return createServerClient(url!, key!, {
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
