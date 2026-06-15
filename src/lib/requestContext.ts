import { AsyncLocalStorage } from 'node:async_hooks';
import type { SupabaseClient } from '@supabase/supabase-js';

// Per-request store so the data layer can reach the request's RLS-bound Supabase
// client (carrying the signed-in user's JWT) without threading it through every
// function signature. Middleware seeds this around next(); AsyncLocalStorage
// propagates it across awaits into page renders and API routes.
//
// Anonymous visitors get a session-less client here → RLS resolves to the "public"
// branch (David/Derek), exactly as before. Signed-in owners get their JWT → RLS
// returns their own (possibly private) tenant. Outside any request (crons, build),
// the store is empty and callers fall back to the anon singleton.
export const requestCtx = new AsyncLocalStorage<{ sb: SupabaseClient | null }>();

export function requestSb(): SupabaseClient | null {
  return requestCtx.getStore()?.sb ?? null;
}
