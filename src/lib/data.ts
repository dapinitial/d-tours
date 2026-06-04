// Data access layer. Reads from Supabase when configured, else falls back to
// mock data so the whole app is clickable with zero secrets. Keep all DB reads
// behind these functions so swapping mock ↔ live is a one-line concern.
import { getSupabase, supabaseConfigured } from './supabase';
import * as mock from './mock';
import type { Stop, Objective, Resource, Post, Detour } from './types';

export const isMock = !supabaseConfigured;

export async function getStops(): Promise<Stop[]> {
  const sb = getSupabase();
  if (!sb) return mock.stops;
  const { data, error } = await sb.from('stops').select('*').order('order', { ascending: true });
  if (error || !data?.length) return mock.stops;
  return data as Stop[];
}

export async function getObjectives(): Promise<Objective[]> {
  const sb = getSupabase();
  if (!sb) return mock.objectives;
  const { data, error } = await sb.from('objectives').select('*');
  if (error || !data?.length) return mock.objectives;
  return data as Objective[];
}

export async function getResources(): Promise<Resource[]> {
  const sb = getSupabase();
  if (!sb) return mock.resources;
  const { data, error } = await sb.from('resources').select('*');
  if (error || !data?.length) return mock.resources;
  return data as Resource[];
}

export async function getPosts(opts: { publishedOnly?: boolean } = {}): Promise<Post[]> {
  const sb = getSupabase();
  let posts: Post[];
  if (!sb) {
    posts = mock.posts;
  } else {
    const { data, error } = await sb.from('posts').select('*').order('created_at', { ascending: false });
    posts = (error || !data?.length) ? mock.posts : (data as Post[]);
  }
  if (opts.publishedOnly) posts = posts.filter((p) => p.published_at);
  return posts;
}

export async function getDetours(): Promise<Detour[]> {
  // Detours are produced live by the look-ahead engine; mock for the skeleton.
  return mock.detours;
}
