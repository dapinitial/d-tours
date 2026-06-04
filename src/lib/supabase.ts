import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Returns a Supabase client, or null when env isn't configured (→ mock mode).
const url = import.meta.env.PUBLIC_SUPABASE_URL;
const anon = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
const service = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabaseConfigured = Boolean(url && anon);

let _public: SupabaseClient | null = null;
let _admin: SupabaseClient | null = null;

/** Browser/anon client — subject to Row Level Security. */
export function getSupabase(): SupabaseClient | null {
  if (!supabaseConfigured) return null;
  if (!_public) _public = createClient(url!, anon!);
  return _public;
}

/** Server-only admin client (service role). NEVER ship this to the browser. */
export function getSupabaseAdmin(): SupabaseClient | null {
  if (!url || !service) return null;
  if (!_admin) _admin = createClient(url, service, { auth: { persistSession: false } });
  return _admin;
}
