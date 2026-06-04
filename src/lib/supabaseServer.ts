import { createServerClient } from '@supabase/ssr';
import type { AstroCookies } from 'astro';

// Per-request Supabase client backed by cookies, so middleware/pages can read the
// signed-in user's session and RLS sees their JWT. Uses the publishable key.
const url = import.meta.env.PUBLIC_SUPABASE_URL ?? process.env.PUBLIC_SUPABASE_URL;
const key =
  import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.PUBLIC_SUPABASE_ANON_KEY ??
  process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.PUBLIC_SUPABASE_ANON_KEY;

export const authConfigured = Boolean(url && key);

function parseCookies(header: string) {
  return header.split(';').map((p) => p.trim()).filter(Boolean).map((p) => {
    const i = p.indexOf('=');
    return { name: p.slice(0, i), value: decodeURIComponent(p.slice(i + 1)) };
  });
}

export function supabaseServer(cookies: AstroCookies, headers: Headers) {
  return createServerClient(url!, key!, {
    cookies: {
      getAll() {
        return parseCookies(headers.get('cookie') ?? '');
      },
      setAll(toSet) {
        toSet.forEach(({ name, value, options }) => cookies.set(name, value, options as any));
      },
    },
  });
}
