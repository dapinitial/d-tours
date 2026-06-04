import type { APIRoute } from 'astro';
import { supabaseServer } from '../../lib/supabaseServer';

export const prerender = false;

// Magic-link lands here with a ?code= → exchange it for a session, set cookies,
// then continue to where they were headed.
export const GET: APIRoute = async ({ url, cookies, request, redirect }) => {
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') ?? '/cms';
  if (code) {
    const supabase = supabaseServer(cookies, request.headers);
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return redirect('/login?denied=1');
  }
  return redirect(next);
};
