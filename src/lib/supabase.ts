import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Public values are inlined at build time (import.meta.env). The server secret is
// read at runtime via process.env so it works when set in the DO dashboard, with
// import.meta.env fallbacks for local dev. Supports both the new sb_publishable_/
// sb_secret_ keys and the legacy anon/service_role names.
// Build-time inlined value first, then runtime process.env (so it works whether DO
// provides these at build or only at run time). Server-only module, so process is safe.
const url = import.meta.env.PUBLIC_SUPABASE_URL ?? process.env.PUBLIC_SUPABASE_URL;
const publishable =
  import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.PUBLIC_SUPABASE_ANON_KEY ??
  process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.PUBLIC_SUPABASE_ANON_KEY;

function secretKey(): string | undefined {
  return (
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    import.meta.env.SUPABASE_SECRET_KEY ??
    import.meta.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export const supabaseConfigured = Boolean(url && publishable);

let _public: SupabaseClient | null = null;
let _admin: SupabaseClient | null = null;

/** Browser/anon client — subject to Row Level Security. */
export function getSupabase(): SupabaseClient | null {
  if (!supabaseConfigured) return null;
  if (!_public) _public = createClient(url!, publishable!);
  return _public;
}

/** Server-only admin client (secret key). NEVER ship this to the browser. */
export function getSupabaseAdmin(): SupabaseClient | null {
  const secret = secretKey();
  if (!url || !secret) return null;
  if (!_admin) _admin = createClient(url, secret, { auth: { persistSession: false } });
  return _admin;
}
