// Data access layer. Reads from Supabase when configured, else falls back to
// mock data so the app is clickable with zero secrets. When Supabase IS
// configured, queries are scoped to a tenant and return that tenant's real data
// (even if empty) — never mock — so tenants stay isolated.
import { getSupabase, getSupabaseAdmin, supabaseConfigured } from './supabase';
import { requestSb } from './requestContext';
import { haversineMi } from './proximity';
import * as mock from './mock';
import type { Stop, Objective, Resource, Post, Detour, GearItem, Source, Chapter } from './types';

// Reads go through the request's RLS-bound client when there is one (so a signed-in
// owner sees their own private trip and an anon visitor sees only public trips),
// falling back to the session-less anon singleton outside a request (build/cron).
function readClient() {
  return requestSb() ?? getSupabase();
}

export const isMock = !supabaseConfigured;

export interface SupportLink { label: string; url: string; }
export interface Tenant {
  id: string; slug: string; name: string; tagline?: string; owner_email?: string; interests?: string[]; is_default?: boolean;
  visibility?: string; intent_text?: string | null; section_schema?: import('./sectionSchema').SectionSchema | null;
  // Per-trip settings (slice 0037). Components read these instead of David's env vars.
  mapshare_feed_url?: string | null;
  location_sharing?: 'precise' | 'approximate' | 'off' | string;
  contact_email?: string | null;
  contact_phone?: string | null;
  support_links?: SupportLink[] | null;
  // Notification settings (slice 0039). Owner controls which emails send + when.
  digest_enabled?: boolean;
  digest_hour?: number;                 // 0–23, local to digest_tz
  digest_tz?: string;                   // IANA timezone
  last_digest_on?: string | null;       // YYYY-MM-DD guard (internal; not user-set)
  sendwindow_alerts_enabled?: boolean;
  proximity_alerts_enabled?: boolean;
}

let _defaultTid: string | null | undefined;

export async function getDefaultTenant(): Promise<Tenant | null> {
  const sb = readClient();
  if (!sb) return null;
  const { data } = await sb.from('tenants').select('*').eq('is_default', true).maybeSingle();
  return (data as Tenant) ?? null;
}

/** A tenant by id (the default trip when omitted). Carries `interests` — the trip's LENS
 *  (e.g. ['climbing'] vs a road-trip's POI tags) for lens-aware per-trip views. */
export async function getTenant(id?: string): Promise<Tenant | null> {
  if (!id) return getDefaultTenant();
  const sb = readClient();
  if (!sb) return null;
  const { data } = await sb.from('tenants').select('*').eq('id', id).maybeSingle();
  return (data as Tenant) ?? null;
}

/** A trip's lens (interest tags). David's trip = ['climbing']; a road trip = its own tags. */
export const tripLens = (t: Tenant | null): string[] => t?.interests ?? [];

export async function getTenantBySlug(slug: string): Promise<Tenant | null> {
  const sb = readClient();
  if (!sb) return null;
  const { data } = await sb.from('tenants').select('*').eq('slug', slug).maybeSingle();
  return (data as Tenant) ?? null;
}

export async function listTenants(): Promise<Tenant[]> {
  const sb = readClient();
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
  const sb = readClient();
  if (!sb) return mock.stops;
  const tid = await resolveTid(tenantId);
  let q = sb.from('stops').select('*').order('order', { ascending: true });
  if (tid) q = q.eq('tenant_id', tid);
  const { data, error } = await q;
  return error ? [] : (data as Stop[]);
}

/** The trip's named, dated chapters — the spine the calendar + map group by. */
export async function getChapters(tenantId?: string): Promise<Chapter[]> {
  const sb = readClient();
  if (!sb) return [];
  const tid = await resolveTid(tenantId);
  let q = sb.from('chapters').select('*').order('sort', { ascending: true });
  if (tid) q = q.eq('tenant_id', tid);
  const { data, error } = await q;
  return error ? [] : (data as Chapter[]);
}

/** A single stop (for its town dossier page). */
export async function getStop(id: string): Promise<Stop | null> {
  const sb = readClient();
  if (!sb) return (mock.stops as Stop[]).find((s) => s.id === id) ?? null;
  const { data, error } = await sb.from('stops').select('*').eq('id', id).maybeSingle();
  return error ? null : (data as Stop | null);
}

export async function getObjectives(tenantId?: string, opts: { includeProposed?: boolean } = {}): Promise<Objective[]> {
  const sb = readClient();
  if (!sb) return mock.objectives;
  const tid = await resolveTid(tenantId);
  // Ordered by the manual trip-sequence `sort` (drag-set in the CMS), nulls last.
  let q = sb.from('objectives').select('*').order('sort', { ascending: true, nullsFirst: false });
  if (tid) q = q.eq('tenant_id', tid);
  q = q.neq('status', 'deferred'); // parked "possible climbs" never surface on plan / beta / proximity
  if (!opts.includeProposed) q = q.neq('status', 'proposed'); // hide scouted alternatives from public
  const { data, error } = await q;
  return error ? [] : (data as Objective[]);
}

/** The "possible climbs" queue — deferred objectives, parked out of the active plan
 *  (too hard, season/weather risk, or just maybes). Owner-only, via the CMS. */
export async function getDeferredObjectives(tenantId?: string): Promise<Objective[]> {
  const sb = getSupabaseAdmin();
  if (!sb) return [];
  const tid = await resolveTid(tenantId);
  let q = sb.from('objectives').select('*').eq('status', 'deferred').order('sort', { ascending: true, nullsFirst: false });
  if (tid) q = q.eq('tenant_id', tid);
  const { data, error } = await q;
  return error ? [] : (data as Objective[]);
}

/** Approved comments on an objective dossier (public — RLS allows reading approved). */
export async function getObjectiveComments(objectiveId: string) {
  const sb = readClient();
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
  const sb = readClient();
  if (!sb) return [];
  const tid = await resolveTid(tenantId);
  let q = sb.from('objectives').select('*').eq('status', 'proposed');
  if (tid) q = q.eq('tenant_id', tid);
  const { data, error } = await q;
  return error ? [] : (data as Objective[]);
}

// ── Duplicate detection ──────────────────────────────────────────────────────
// A real duplicate = the SAME route, not the same mountain. Stuart has a West Ridge
// AND a North Ridge; Dragontail has Serpentine AND Backbone — different lines on one
// peak are NOT dupes. So we match on FULL-NAME similarity (Jaccard over normalized
// tokens), with nearby coords only as a secondary signal. "mt stuart west ridge" vs
// "mt stuart complete north ridge" → Jaccard ~0.33 → correctly NOT flagged.
const DUP_STOP = new Set(['the', 'via', 'and', 'for', 'a', 'of', 'to']);
function dupTokens(s?: string): string[] {
  return (s ?? '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // strip accents (Arête → arete)
    .replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/)
    .map((w) => (w === 'mount' ? 'mt' : w))
    .filter((w) => w.length >= 3 && !DUP_STOP.has(w));
}
function jaccard(a: string[], b: string[]): number {
  const A = new Set(a), B = new Set(b);
  if (!A.size || !B.size) return 0;
  let inter = 0; for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

export interface DupHit { id: string; name: string; score: number; near_mi: number | null; level: 'likely' | 'possible'; }

/** Find existing objectives that look like duplicates of a (name, lat, lng).
 *  `likely` = strong name overlap (probably the same route); `possible` = moderate
 *  overlap AND basically the same spot. Returns [] when it's clearly a new line. */
export async function findDuplicateObjectives(
  name: string, lat?: number | null, lng?: number | null, tenantId?: string, excludeId?: string,
): Promise<DupHit[]> {
  const objs = await getObjectives(tenantId, { includeProposed: true });
  const nt = dupTokens(name);
  if (!nt.length) return [];
  const hits: DupHit[] = [];
  for (const o of objs) {
    if (o.id === excludeId) continue;
    const score = jaccard(nt, dupTokens(o.name));
    const near = (lat != null && lng != null && o.lat != null && o.lng != null)
      ? haversineMi(lat, lng, o.lat as number, o.lng as number) : null;
    let level: 'likely' | 'possible' | null = null;
    if (score >= 0.6) level = 'likely';                                   // same route, name-wise
    else if (score >= 0.45 && near != null && near <= 0.7) level = 'possible'; // close name + same spot
    if (level) hits.push({ id: o.id, name: o.name, score: Math.round(score * 100) / 100, near_mi: near == null ? null : Math.round(near * 10) / 10, level });
  }
  return hits.sort((a, b) => b.score - a.score);
}

/** A single objective by id (for the /objectives/[id] dossier page). */
export async function getObjective(id: string): Promise<Objective | null> {
  const sb = readClient();
  if (!sb) return mock.objectives.find((o) => o.id === id) ?? null;
  const { data } = await sb.from('objectives').select('*').eq('id', id).maybeSingle();
  return (data as Objective) ?? null;
}

/** The rig build-page + maintenance log (one row per tenant, public read). */
export async function getRig(tenantId?: string) {
  const sb = readClient();
  if (!sb) return null;
  const tid = await resolveTid(tenantId);
  let q = sb.from('rig').select('*');
  if (tid) q = q.eq('tenant_id', tid);
  const { data, error } = await q.maybeSingle();
  return error ? null : data;
}

export async function getResources(tenantId?: string): Promise<Resource[]> {
  const sb = readClient();
  if (!sb) return mock.resources;
  const tid = await resolveTid(tenantId);
  let q = sb.from('resources').select('*');
  if (tid) q = q.eq('tenant_id', tid);
  const { data, error } = await q;
  return error ? [] : (data as Resource[]);
}

export async function getPosts(opts: { publishedOnly?: boolean; tenantId?: string } = {}): Promise<Post[]> {
  const sb = readClient();
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
  const sb = readClient();
  if (!sb) return mock.posts.find((p) => p.id === id) ?? null;
  const { data } = await sb.from('posts').select('*').eq('id', id).maybeSingle();
  return (data as Post) ?? null;
}

export async function getGear(tenantId?: string): Promise<GearItem[]> {
  const sb = readClient();
  if (!sb) return mock.gear;
  const tid = await resolveTid(tenantId);
  let q = sb.from('gear').select('*');
  if (tid) q = q.eq('tenant_id', tid);
  const { data, error } = await q;
  return error ? [] : (data as GearItem[]);
}

export async function getPlaylists(tenantId?: string) {
  const sb = readClient();
  if (!sb) return mock.playlists;
  const tid = await resolveTid(tenantId);
  let q = sb.from('playlist_suggestions').select('*').eq('status', 'approved').order('created_at', { ascending: false });
  if (tid) q = q.eq('tenant_id', tid);
  const { data, error } = await q;
  return error ? [] : data;
}

export async function getSources(tenantId?: string): Promise<Source[]> {
  const sb = readClient();
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

/** Caravan sign-ups for one objective — PUBLIC roster (RLS lets confirmed through).
 *  Contact is omitted on purpose; it's owner-only. */
export async function getSignups(objectiveId: string): Promise<import('./types').Signup[]> {
  const sb = readClient();
  if (!sb) return [];
  const { data, error } = await sb.from('signups')
    .select('id,objective_id,name,role,note,status,created_at')
    .eq('objective_id', objectiveId).eq('status', 'confirmed')
    .order('created_at', { ascending: true });
  return error ? [] : (data as import('./types').Signup[]);
}

/** ALL sign-ups (owner CMS, service role) — optionally filtered by status. */
export async function getAllSignups(tenantId?: string, status?: string): Promise<import('./types').Signup[]> {
  const sb = getSupabaseAdmin();
  if (!sb) return [];
  const tid = await resolveTid(tenantId);
  let q = sb.from('signups').select('*').order('created_at', { ascending: false });
  if (tid) q = q.eq('tenant_id', tid);
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  return error ? [] : (data as import('./types').Signup[]);
}

/** The skills video library (rope/rescue/alpine technique). Public read. */
export async function getSkills(tenantId?: string): Promise<import('./types').Skill[]> {
  const sb = readClient();
  if (!sb) return [];
  const tid = await resolveTid(tenantId);
  let q = sb.from('skills').select('*').order('sort', { ascending: true });
  if (tid) q = q.eq('tenant_id', tid);
  const { data, error } = await q;
  return error ? [] : (data as import('./types').Skill[]);
}

/** The squad — trip companions (who's riding which leg). Public read. */
export async function getCompanions(tenantId?: string): Promise<import('./types').Companion[]> {
  const sb = readClient();
  if (!sb) return [];
  const tid = await resolveTid(tenantId);
  let q = sb.from('companions')
    .select('id,name,nickname,emoji,color,role,leg,joins_at,joins_lat,joins_lng,status,status_note,mapshare_url,note,sort,last_lat,last_lng,last_seen,published')
    .eq('published', true).order('sort', { ascending: true });  // track_key excluded (secret)
  if (tid) q = q.eq('tenant_id', tid);
  const { data, error } = await q;
  return error ? [] : (data as import('./types').Companion[]);
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

/** 📍 The rolled-past log — every proximity-watcher hit, newest first. Owner-only
 *  (service role; the table has no public RLS policy). Server-side use only. */
export async function getProximityLog(tenantId?: string, limit = 60) {
  const sb = getSupabaseAdmin();
  if (!sb) return [];
  const tid = await resolveTid(tenantId);
  let q = sb.from('proximity_log').select('*').order('created_at', { ascending: false }).limit(limit);
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
  const sb = readClient();
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
  const sb = readClient();
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
