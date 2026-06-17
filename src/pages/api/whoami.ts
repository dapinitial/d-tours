import type { APIRoute } from 'astro';
import { supabaseServer, authConfigured } from '../../lib/supabaseServer';

export const prerender = false;

// TEMP diagnostic for the post-login bounce: visit /api/whoami in the browser right
// after signing in. It reports whether the server can see your session + which auth
// cookies actually made it back — without needing the Supabase/DO logs. Remove later.
export const GET: APIRoute = async ({ request, cookies, url }) => {
  const cookieHeader = request.headers.get('cookie') ?? '';
  const names = cookieHeader.split(';').map((c) => c.split('=')[0].trim()).filter(Boolean);
  const authCookieNames = names.filter((n) => n.startsWith('sb-') || n.includes('auth-token'));
  let user: string | null = null, err: string | null = null;
  if (authConfigured) {
    try {
      const sb = supabaseServer(cookies, request.headers);
      const { data, error } = await sb.auth.getUser();
      user = data?.user?.email ?? null;
      err = error?.message ?? null;
    } catch (e: any) { err = String(e?.message ?? e); }
  }
  return new Response(JSON.stringify({
    host: url.host,
    sees_user: user,
    getUser_error: err,
    auth_cookies_present: authCookieNames,
    total_cookies: names.length,
  }, null, 2), { headers: { 'Content-Type': 'application/json' } });
};
