// Shared domain types for D-Tours. These mirror the Supabase schema in
// supabase/migrations/0001_init.sql. Every entity can both *publish* to the
// visitor site and *trigger* a Shotgun comm.

export type Flex = 'hard' | 'soft' | 'open';

/** Lifecycle of an itinerary item. D-Tours stages `proposed`/`suggested`;
 *  David confirms (via Messenger) → `confirmed`, or `declined`. */
export type StopStatus = 'confirmed' | 'proposed' | 'suggested' | 'declined';
export type StopKind = 'stop' | 'sidequest' | 'pitstop';

/** A stop on the route timeline / a travel day. `flex` drives the detour engine. */
export interface Stop {
  id: string;
  order: number;         // fractional ok (7.5 inserts between 7 and 8)
  name: string;
  sub?: string;          // "Refuel & Whitley", "Chels, Jillian & Fam"
  emoji?: string;
  date?: string;         // ISO or human ("Mid-July", "Aug 1")
  flex: Flex;            // hard = fixed deadline, soft = some slack, open = whenever
  region?: string;
  rendezvous?: string;   // e.g. "Derek (solar camper) from Grand Rapids"
  status?: StopStatus;   // default 'confirmed' when absent
  kind?: StopKind;       // 'sidequest' / 'pitstop' for D-Tours additions
  lat?: number;          // coords let a live GPS fix locate you within the journey
  lng?: number;
  source?: 'david' | 'shotgun';  // who added it
  note?: string;
  off_route_mi?: number; // for side-quests / pit-stops
  time_cost_min?: number;
}

export interface Objective {
  id: string;
  name: string;
  region: string;
  commitment: string;    // "7 Pitches", "9-mi approach / Multi-day"
  grade: string;
  hazard: string;
  severity: 'low' | 'med' | 'high';
  discipline?: string;   // trad / sport / scramble / alpine
}

export type CareLayer = 'climb' | 'life' | 'move' | 'weird';

export interface Resource {
  id: string;
  layer: CareLayer | 'logistics';
  title: string;
  emoji: string;
  body: string;
  region?: string;
}

export interface Post {
  id: string;
  title: string;
  body: string;
  created_at: string;
  published_at?: string | null;  // null = queued (Tier 1), set on flush (Tier 2)
  lat?: number | null;
  lng?: number | null;
  media: string[];               // storage URLs
  author?: string;
  like_count?: number;
  tier?: 1 | 2;
}

export interface Comment {
  id: string;
  post_id: string;
  author: string;
  body: string;
  created_at: string;
  approved: boolean;             // gated: crew-only via magic link, owner-moderated
}

export type GearStatus = 'packed' | 'repair' | 'replace' | 'loaned' | 'missing';

/** A piece of kit in the rig. Shotgun can answer "did I pack the #4?" and nag
 *  about repairs/replacements/loans. */
export interface GearItem {
  id: string;
  name: string;
  category: string;          // Climbing / Ropes / Water / Bikes / Comms & Power / Camp / Vehicle
  emoji?: string;
  status: GearStatus;
  qty?: number;
  note?: string;
  loaned_to?: string;
  objectives?: string[];     // which objectives this kit is for
}

export type SourceStatus = 'new' | 'enriched' | 'error';

/** A link the owner feeds in for "our Claude" to read and distill. The CMS
 *  defines what to enrich; the home-iMac agent fetches the page and writes the
 *  distilled `beta` back. Optionally pinned to a stop or objective. */
export interface Source {
  id: string;
  tenant_id?: string;
  url: string;
  title?: string;
  note?: string;                 // owner instruction: "pull current conditions"
  tag?: string;                  // wikipedia | mountain-project | wta | forecast | general …
  stop_id?: string | null;
  objective_id?: string | null;
  status: SourceStatus;
  beta?: string | null;          // distilled markdown the agent writes back
  beta_updated_at?: string | null;
  created_at?: string;
}

/** A Shotgun suggestion produced by the D-Tours look-ahead engine. */
export interface Detour {
  id: string;
  type: string;                  // hot-spring, water, gas, gym, weird, scramble...
  title: string;
  emoji: string;
  off_route_mi: number;
  time_cost_min: number;
  lat?: number;
  lng?: number;
  fits_slack: boolean;
  note?: string;
}
