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
    // Claim any pre-existing crew row for this email (co-owners added before they
    // ever signed in), so RLS (keyed on auth_user_id) recognizes them.
    await supabase.rpc('link_my_crew');
    // New users (no crew/trip yet) go to onboarding; owners go where they were headed.
    const { data: { user } } = await supabase.auth.getUser();
    const { data: crew } = user
      ? await supabase.from('crew').select('tenant_id').eq('email', user.email).maybeSingle()
      : { data: null };
    if (!crew?.tenant_id) return redirect('/welcome');
  }
  return redirect(next);
};
