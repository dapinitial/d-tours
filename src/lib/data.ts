// Data access layer. Reads from Supabase when configured, else falls back to
// mock data so the app is clickable with zero secrets. When Supabase IS
// configured, queries are scoped to a tenant and return that tenant's real data
// (even if empty) — never mock — so tenants stay isolated.
import { getSupabase, getSupabaseAdmin, supabaseConfigured } from './supabase';
import * as mock from './mock';
import type { Stop, Objective, Resource, Post, Detour, GearItem, Source } from './types';

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

export async function getObjectives(tenantId?: string, opts: { includeProposed?: boolean } = {}): Promise<Objective[]> {
  const sb = getSupabase();
  if (!sb) return mock.objectives;
  const tid = await resolveTid(tenantId);
  let q = sb.from('objectives').select('*');
  if (tid) q = q.eq('tenant_id', tid);
  if (!opts.includeProposed) q = q.neq('status', 'proposed'); // hide scouted alternatives from public
  const { data, error } = await q;
  return error ? [] : (data as Objective[]);
}

/** Approved comments on an objective dossier (public — RLS allows reading approved). */
export async function getObjectiveComments(objectiveId: string) {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb.from('comments').select('author, body, created_at')
    .eq('objective_id', objectiveId).eq('approved', true).order('created_at', { ascending: true });
  return error ? [] : (data ?? []);
}

/** Pending (unapproved) comments awaiting moderation (owner-only → service role). */
export async function getPendingComments(tenantId?: string) {
  const sb = getSupabaseAdmin();
  if (!sb) return [];
  const tid = await resolveTid(tenantId);
  let q = sb.from('comments').select('*').eq('approved', false).order('created_at', { ascending: false });
  if (tid) q = q.eq('tenant_id', tid);
  const { data, error } = await q;
  return error ? [] : (data ?? []);
}

/** Scouted alternatives David is weighing — shown publicly so friends can react/comment. */
export async function getProposedObjectives(tenantId?: string): Promise<Objective[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const tid = await resolveTid(tenantId);
  let q = sb.from('objectives').select('*').eq('status', 'proposed');
  if (tid) q = q.eq('tenant_id', tid);
  const { data, error } = await q;
  return error ? [] : (data as Objective[]);
}

/** A single objective by id (for the /objectives/[id] dossier page). */
export async function getObjective(id: string): Promise<Objective | null> {
  const sb = getSupabase();
  if (!sb) return mock.objectives.find((o) => o.id === id) ?? null;
  const { data } = await sb.from('objectives').select('*').eq('id', id).maybeSingle();
  return (data as Objective) ?? null;
}

/** The rig build-page + maintenance log (one row per tenant, public read). */
export async function getRig(tenantId?: string) {
  const sb = getSupabase();
  if (!sb) return null;
  const tid = await resolveTid(tenantId);
  let q = sb.from('rig').select('*');
  if (tid) q = q.eq('tenant_id', tid);
  const { data, error } = await q.maybeSingle();
  return error ? null : data;
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

/** A single published post by id (for /journal/[id] permalinks). */
export async function getPost(id: string): Promise<Post | null> {
  const sb = getSupabase();
  if (!sb) return mock.posts.find((p) => p.id === id) ?? null;
  const { data } = await sb.from('posts').select('*').eq('id', id).maybeSingle();
  return (data as Post) ?? null;
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

export async function getSources(tenantId?: string): Promise<Source[]> {
  const sb = getSupabase();
  if (!sb) return mock.sources;
  const tid = await resolveTid(tenantId);
  let q = sb.from('sources').select('*').order('created_at', { ascending: false });
  if (tid) q = q.eq('tenant_id', tid);
  const { data, error } = await q;
  return error ? [] : (data as Source[]);
}

/** Rendezvous meet-ups. status='confirmed' for public display, 'proposed' for
 *  CMS moderation. Service-role read (proposed rows aren't publicly readable). */
export async function getRendezvous(tenantId?: string, status?: string) {
  const sb = getSupabaseAdmin();
  if (!sb) return [];
  const tid = await resolveTid(tenantId);
  let q = sb.from('rendezvous').select('*').order('created_at', { ascending: false });
  if (tid) q = q.eq('tenant_id', tid);
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  return error ? [] : (data ?? []);
}

/** The dispatch subscriber list (owner-only → service role; table has no public
 *  RLS policy). Optionally filter by cadence. Server-side use only. */
export async function getSubscribers(tenantId?: string, cadence?: string): Promise<{ email: string; cadence: string }[]> {
  const sb = getSupabaseAdmin();
  if (!sb) return [];
  const tid = await resolveTid(tenantId);
  let q = sb.from('subscribers').select('email, cadence');
  if (tid) q = q.eq('tenant_id', tid);
  if (cadence) q = q.eq('cadence', cadence);
  const { data, error } = await q;
  return error ? [] : ((data as any) ?? []);
}

/** Follower detour suggestions awaiting the owner's approval (CMS moderation).
 *  Owner-only data → read via service role (the table has no public RLS policy
 *  by design, so the anon client would return nothing). Server-side use only. */
export async function getSuggestions(tenantId?: string, status = 'pending') {
  const sb = getSupabaseAdmin();
  if (!sb) return [];
  const tid = await resolveTid(tenantId);
  let q = sb.from('suggestions').select('*').eq('status', status).order('created_at', { ascending: false });
  if (tid) q = q.eq('tenant_id', tid);
  const { data, error } = await q;
  return error ? [] : (data ?? []);
}

/** Pending music picks awaiting the owner's approval (CMS moderation). Owner-only
 *  → service role: the public policy only exposes 'approved' rows. Server-side use only. */
export async function getPlaylistSuggestions(tenantId?: string, status = 'pending') {
  const sb = getSupabaseAdmin();
  if (!sb) return [];
  const tid = await resolveTid(tenantId);
  let q = sb.from('playlist_suggestions').select('*').eq('status', status).order('created_at', { ascending: false });
  if (tid) q = q.eq('tenant_id', tid);
  const { data, error } = await q;
  return error ? [] : (data ?? []);
}

/** The most recently spun track = "now playing". */
export async function getNowPlaying(tenantId?: string) {
  const sb = getSupabase();
  if (!sb) return (mock.playlists as any[])[0] ?? null;
  const tid = await resolveTid(tenantId);
  let q = sb.from('playlist_suggestions').select('*').not('played_at', 'is', null)
    .order('played_at', { ascending: false }).limit(1);
  if (tid) q = q.eq('tenant_id', tid);
  const { data, error } = await q.maybeSingle();
  return error ? null : data;
}

/** The soundtrack so far — everything actually played, newest first. */
export async function getSoundtrack(tenantId?: string) {
  const sb = getSupabase();
  if (!sb) return mock.playlists as any[];
  const tid = await resolveTid(tenantId);
  let q = sb.from('playlist_suggestions').select('*').not('played_at', 'is', null)
    .order('played_at', { ascending: false });
  if (tid) q = q.eq('tenant_id', tid);
  const { data, error } = await q;
  return error ? [] : (data ?? []);
}

/** Shotgun's staged finds — the proposed/suggested stops the look-ahead engine
 *  dropped onto the plan, shaped as Detours for the homepage card + digest.
 *  Falls back to mock so the showcase isn't empty before anything's staged. */
export async function getDetours(tenantId?: string): Promise<Detour[]> {
  const stops = await getStops(tenantId);
  const staged = stops
    .filter((s) => s.status === 'proposed' || s.status === 'suggested')
    .map((s): Detour => ({
      id: s.id,
      type: s.kind === 'pitstop' ? 'pitstop' : (s.kind ?? 'sidequest'),
      title: s.name,
      emoji: s.emoji ?? '📍',
      off_route_mi: s.off_route_mi ?? 0,
      time_cost_min: s.time_cost_min ?? 0,
      lat: s.lat, lng: s.lng,
      fits_slack: s.flex !== 'hard',
      note: s.note,
    }));
  return staged.length ? staged : mock.detours;
}
