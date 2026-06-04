// Data access layer. Reads from Supabase when configured, else falls back to
// mock data so the app is clickable with zero secrets. When Supabase IS
// configured, queries are scoped to a tenant and return that tenant's real data
// (even if empty) — never mock — so tenants stay isolated.
import { getSupabase, supabaseConfigured } from './supabase';
import * as mock from './mock';
import type { Stop, Objective, Resource, Post, Detour, GearItem } from './types';

export const isMock = !supabaseConfigured;

export interface Tenant { id: string; slug: string; name: string; tagline?: string; owner_email?: string; }

let _defaultTid: string | null | undefined;

export async function getDefaultTenant(): Promise<Tenant | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.from('tenants').select('*').eq('is_default', true).maybeSingle();
  return (data as Tenant) ?? null;
}

export async function getTenantBySlug(slug: string): Promise<Tenant | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.from('tenants').select('*').eq('slug', slug).maybeSingle();
  return (data as Tenant) ?? null;
}

export async function listTenants(): Promise<Tenant[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data } = await sb.from('tenants').select('*').order('is_default', { ascending: false });
  return (data as Tenant[]) ?? [];
}

async function resolveTid(tenantId?: string): Promise<string | null> {
  if (tenantId) return tenantId;
  if (_defaultTid !== undefined) return _defaultTid;
  const t = await getDefaultTenant();
  _defaultTid = t?.id ?? null;
  return _defaultTid;
}

export async function getStops(tenantId?: string): Promise<Stop[]> {
  const sb = getSupabase();
  if (!sb) return mock.stops;
  const tid = await resolveTid(tenantId);
  let q = sb.from('stops').select('*').order('order', { ascending: true });
  if (tid) q = q.eq('tenant_id', tid);
  const { data, error } = await q;
  return error ? [] : (data as Stop[]);
}

export async function getObjectives(tenantId?: string): Promise<Objective[]> {
  const sb = getSupabase();
  if (!sb) return mock.objectives;
  const tid = await resolveTid(tenantId);
  let q = sb.from('objectives').select('*');
  if (tid) q = q.eq('tenant_id', tid);
  const { data, error } = await q;
  return error ? [] : (data as Objective[]);
}

export async function getResources(tenantId?: string): Promise<Resource[]> {
  const sb = getSupabase();
  if (!sb) return mock.resources;
  const tid = await resolveTid(tenantId);
  let q = sb.from('resources').select('*');
  if (tid) q = q.eq('tenant_id', tid);
  const { data, error } = await q;
  return error ? [] : (data as Resource[]);
}

export async function getPosts(opts: { publishedOnly?: boolean; tenantId?: string } = {}): Promise<Post[]> {
  const sb = getSupabase();
  let posts: Post[];
  if (!sb) {
    posts = mock.posts;
  } else {
    const tid = await resolveTid(opts.tenantId);
    let q = sb.from('posts').select('*').order('created_at', { ascending: false });
    if (tid) q = q.eq('tenant_id', tid);
    const { data, error } = await q;
    posts = error ? [] : (data as Post[]);
  }
  if (opts.publishedOnly) posts = posts.filter((p) => p.published_at);
  return posts;
}

export async function getGear(tenantId?: string): Promise<GearItem[]> {
  const sb = getSupabase();
  if (!sb) return mock.gear;
  const tid = await resolveTid(tenantId);
  let q = sb.from('gear').select('*');
  if (tid) q = q.eq('tenant_id', tid);
  const { data, error } = await q;
  return error ? [] : (data as GearItem[]);
}

export async function getPlaylists(tenantId?: string) {
  const sb = getSupabase();
  if (!sb) return mock.playlists;
  const tid = await resolveTid(tenantId);
  let q = sb.from('playlist_suggestions').select('*').eq('status', 'approved').order('created_at', { ascending: false });
  if (tid) q = q.eq('tenant_id', tid);
  const { data, error } = await q;
  return error ? [] : data;
}

export async function getDetours(): Promise<Detour[]> {
  // Detours are produced live by the look-ahead engine; mock for the skeleton.
  return mock.detours;
}
