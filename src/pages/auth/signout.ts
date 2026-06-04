import type { APIRoute } from 'astro';
import { supabaseServer } from '../../lib/supabaseServer';

export const prerender = false;

export const POST: APIRoute = async ({ cookies, request, redirect }) => {
  const supabase = supabaseServer(cookies, request.headers);
  await supabase.auth.signOut();
  return redirect('/login');
};
export const GET = POST;
