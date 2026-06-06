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

/** The structured dossier Shotgun compiles for an objective from its pinned
 *  sources. All fields optional — filled progressively as beta comes in. */
export interface ObjectiveBeta {
  summary?: string;
  at_a_glance?: { hike_type?: string; trail?: string; road?: string; bugs?: string; snow?: string }; // WTA-style quick status, bubbled to top
  fishing?: string;       // can we fish? species, license, where
  trailhead?: { name?: string; gmaps_url?: string; drive?: string; lat?: number; lng?: number }; // directions to the TH
  routes?: { name: string; grade?: string; note?: string; url?: string }[]; // incl. the main + nearby
  rack?: string;          // "Doubles to #3, single #4"
  ropes?: string;         // "60m doubles" / "70m single"
  footwear?: string;      // "approach shoes; mountain boots above snowline"
  mountaineering?: string;// ice axe, crampons, boots w/ heel+toe welt, helmet, headlamp — snow/alpine kit
  food?: string;          // calorie/food guidance for the objective ("~3,500 kcal/day x 3 days…")
  skills?: string[];      // "kiwi coil", "simul-climb", "crevasse rescue", "glacier travel"
  glacier?: string;       // glacier-travel / crevasse-rescue kit notes
  last_services?: string; // last gas / store / food before the trailhead + where service drops
  signal?: string;        // cell coverage on the drive in & at the objective — AT&T and Verizon
  land?: string;          // managing agency (BLM / NPS / National Forest / state) + pass needed (NW Forest Pass / America the Beautiful / day-use fee)
  camp?: string[];        // where to camp
  free_camp?: string[];   // FREE / dispersed camping nearby
  water?: string[];       // where to get water
  permits?: string;       // permits / fees / reservations
  toilet?: string;        // WAG bags / where to poop
  hazards?: string[];     // rockfall, lightning, grizzlies, etc.
  wildlife?: string;      // bears (spray/canister), birding, edible plants, bugs/spiders
  fire?: string;          // wildfire / smoke / air-quality situation + closures
  emergency?: { label: string; phone?: string; note?: string }[]; // sheriff, SAR, ranger station, nearest hospital
  watch_for?: string[];   // (legacy flat list — superseded by field_guide below)
  /** Interactive field guide — each entry renders as a tap/hover card with ID,
   *  edibility/danger, first-aid, photo + link. */
  field_guide?: {
    name: string;
    kind: 'edible' | 'poisonous' | 'medicinal' | 'wildlife' | 'snake' | 'insect' | 'landmark';
    note?: string;   // what it is / how to recognize
    treat?: string;  // first-aid if bitten/stung/ingested
    photo?: string;  // image URL (Wikimedia)
    url?: string;    // Wikipedia / field-guide link
  }[];
  fire_rules?: string;    // campfires allowed? current bans/restrictions; alpine = usually no fires, stove-only
  access?: { visitor_center?: string; ranger_station?: string; pass?: string; url?: string }; // visitor center / ranger / pass + official link
  poi?: { name: string; note?: string; url?: string }[]; // fire lookouts, downed aircraft, historic sites, old mines/relics
  photos?: { url: string; caption?: string }[];          // the place, the trail, plants/wildlife to recognize
  conditions?: { weather_url?: string; mountain_forecast_url?: string; avalanche_url?: string; fire_url?: string; bugs?: string }; // live links
  nearby?: string[];      // other climbs / points of interest nearby
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
  beta?: ObjectiveBeta;  // Shotgun-compiled dossier (jsonb)
  gpx_url?: string;      // downloadable GPX track
}

/** The RIG — build-page spotlight + maintenance log (one per tenant). */
export interface Rig {
  tenant_id?: string;
  name?: string;
  tagline?: string;
  video_url?: string;           // YouTube capability/build video
  living?: string;              // how we live & travel
  photos?: { url: string; caption?: string }[];
  capabilities?: string[];      // what it can do (off-road, sleeps 2, off-grid power…)
  build?: Record<string, string>;       // Engine / Suspension / Winch / Lighting…
  maintenance?: Record<string, string>; // Oil type / Oil interval / Air filter / Tires…
  bulbs?: { location: string; part?: string }[]; // bulb part numbers
  tools?: string[];             // tools carried
  service_log?: { date: string; what: string }[]; // service history
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
  category: string;          // Climbing / Ropes / Power & Electronics / Vehicle & Recovery / Shelter & Sleep …
  subcategory?: string;      // finer grouping within a category (Cams / Nuts / Ropes …)
  emoji?: string;
  status: GearStatus;
  qty?: number;
  note?: string;
  loaned_to?: string;
  objectives?: string[];     // which objectives this kit is for
  specs?: Record<string, string>; // freeform detail: { Year: "2019", "Last re-sling": "2024-03", Material: "alloy", Length: "30m", Diameter: "9.2mm", Finish: "dry" }
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
