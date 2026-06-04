// Mock data so the app runs with ZERO secrets configured. The data layer
// (data.ts) uses these whenever Supabase env vars are absent. Content mirrors
// the real Austin → Squamish trip from SPEC.md.
import type { Stop, Objective, Resource, Post, Detour, GearItem } from './types';

export const stops: Stop[] = [
  { id: 's1', order: 1, name: 'Austin', sub: 'Launch', emoji: '🚀', flex: 'open', region: 'TX', date: 'Early July' },
  { id: 's2', order: 2, name: 'Dallas', sub: 'Refuel & Whitley · Deep Ellum beers', emoji: '⛽', flex: 'soft', region: 'TX' },
  { id: 's3', order: 3, name: 'The Rez', sub: 'Oklahoma', emoji: '🪶', flex: 'open', region: 'OK' },
  { id: 's4', order: 4, name: 'Southern CO', sub: 'Shelf Road cragging', emoji: '⛰️', flex: 'soft', region: 'CO' },
  { id: 's5', order: 5, name: 'Denver / FoCo', sub: 'Chels, Jillian & Fam · a hike', emoji: '👥', flex: 'soft', region: 'CO' },
  { id: 's6', order: 6, name: 'The Winds', sub: 'Cirque of the Towers', emoji: '🏔️', flex: 'soft', region: 'WY', date: 'Mid-July' },
  { id: 's7', order: 7, name: 'City of Rocks', sub: 'Desert granite', emoji: '🪨', flex: 'soft', region: 'ID' },
  { id: 's8', order: 8, name: 'Flathead / Glacier', sub: 'Rendezvous with Derek 🚐☀️', emoji: '🏞️', flex: 'soft', region: 'MT', date: 'Jul 21', rendezvous: 'Derek — solar camper from Grand Rapids' },
  { id: 's9', order: 9, name: 'Spokane', sub: "Ricardo's Wedding — HARD deadline", emoji: '💍', flex: 'hard', region: 'WA', date: 'Aug 1' },
  { id: 's10', order: 10, name: 'Mazama', sub: 'North Cascades', emoji: '🌲', flex: 'soft', region: 'WA' },
  { id: 's11', order: 11, name: 'Squamish', sub: 'Send before the next chapter', emoji: '🧗', flex: 'open', region: 'BC' },
  { id: 's12', order: 12, name: 'Kaf Adventures', sub: 'Alpine Mentorship — post-wedding', emoji: '🎓', flex: 'open', region: 'WA / Cascades' },
  // ── D-Tours proposals, staged by Shotgun, awaiting your 👍 (on-the-fly) ──
  { id: 'ps1', order: 5.5, name: 'Saratoga Hot Spring', sub: 'Pit-stop · free, 24/7', emoji: '♨️', flex: 'open', region: 'WY', status: 'suggested', kind: 'pitstop', source: 'shotgun', off_route_mi: 0.5, time_cost_min: 45, note: 'Hobo Pool off US-287.' },
  { id: 'sq1', order: 7.5, name: 'Garden of 1000 Buddhas', sub: 'Side-quest · Arlee, MT', emoji: '🌀', flex: 'open', region: 'MT', status: 'proposed', kind: 'sidequest', source: 'shotgun', off_route_mi: 8, time_cost_min: 60, note: 'On the way to Flathead — fits your slack.' },
];

export const objectives: Objective[] = [
  { id: 'o1', name: 'Shelf Road Crags', region: 'Cañon City, CO', commitment: 'Single Pitch Sport', grade: '5.7 – 5.10', hazard: 'Summer Heat', severity: 'med', discipline: 'sport' },
  { id: 'o2', name: 'The Yellow Spur', region: 'Eldorado Canyon, CO', commitment: '7 Pitches', grade: '5.6 or 5.9 Trad', hazard: 'Radical Exposure', severity: 'med', discipline: 'trad' },
  { id: 'o3', name: 'The Spearhead (Sykes Sickle)', region: 'RMNP, CO', commitment: '6 Pitches / 5-mi hike', grade: '5.6 Alpine Trad', hazard: 'Altitude (12k+)', severity: 'high', discipline: 'alpine' },
  { id: 'o4', name: 'Cirque of the Towers Traverse', region: 'Wind River Range, WY', commitment: '9-mi approach / Multi-day', grade: '4th – Low 5th Class', hazard: 'Lightning & Marmots', severity: 'high', discipline: 'scramble' },
  { id: 'o5', name: 'Theater of Shadows / Tribal Boundaries', region: 'City of Rocks, ID', commitment: '1-2 Pitches', grade: '5.7 – 5.10', hazard: 'High-Friction Granite Finishes', severity: 'med', discipline: 'sport' },
  { id: 'o6', name: 'Shoshone Spire (South Face)', region: 'Bitterroots, MT', commitment: '6-7 Pitches / 4.5-mi hike', grade: '5.8 Trad', hazard: 'Sustained Cracks', severity: 'med', discipline: 'trad' },
  { id: 'o7', name: 'Swiftsure Ridge (Mt. Reynolds)', region: 'Glacier NP, MT', commitment: 'Full Day / Airy Ridge', grade: '5.4 Alpine', hazard: 'Choss & Grizzlies', severity: 'high', discipline: 'alpine' },
];

export const resources: Resource[] = [
  // logistics / basecamps
  { id: 'r1', layer: 'logistics', title: 'Texas Refuel', emoji: '👥', body: 'Dallas stop to visit Whitley + Deep Ellum for beers.', region: 'TX' },
  { id: 'r2', layer: 'logistics', title: 'Colorado Friends & Fam', emoji: '👥', body: 'Base camps out of Southern CO, Denver & Fort Collins — Chels, Jillian & family. Quick cragging in Clear Creek, Eldo, Horsetooth bouldering.', region: 'CO' },
  { id: 'r3', layer: 'logistics', title: 'The Winds', emoji: '🏕️', body: 'Big Sandy Trailhead. ⚠️ 40-mile dirt road — wrap/protect the undercarriage from salt-seeking porcupines.', region: 'WY' },
  { id: 'r4', layer: 'logistics', title: 'Idaho Recharge', emoji: '🏕️', body: 'City of Rocks — incredible desert granite camping right at the base of the routes.', region: 'ID' },
  { id: 'r5', layer: 'logistics', title: 'Montana Basecamps', emoji: '🏕️', body: 'Blodgett Creek TH (Bitterroot primitive) + Hungry Horse Reservoir West Side (Flathead designated dispersed, on water). Meet Derek here.', region: 'MT' },
  { id: 'r6', layer: 'life', title: 'Rest-Day Hot Springs', emoji: '♨️', body: 'Saratoga, WY (free, 24/7, off US-287) · Granite Hot Springs (Jackson corridor) · Fairmont Hot Springs (Butte, MT — resort showers).', region: 'WY/MT' },
  // life-maintenance
  { id: 'r7', layer: 'life', title: 'Showers & Cleanup', emoji: '🚿', body: 'Truck stops, rec centers, hot springs, KOAs. Shotgun tracks where to rinse, shave & reset.' },
  { id: 'r8', layer: 'life', title: 'Laundry & Barber', emoji: '🧺', body: 'Laundromats + barbershops along the corridor. "Need a haircut or a wash?"' },
  { id: 'r9', layer: 'life', title: 'Gear Repair & Replace', emoji: '🛠️', body: 'Climbing/outdoor shops for resoles, replacement cams, tubes, repairs.' },
  { id: 'r10', layer: 'life', title: 'Pit Stops', emoji: '🅿️', body: 'Rest areas, truck stops, RV dump stations, free/dispersed camping (iOverlander / Recreation.gov / OSM).' },
  // move / mobility
  { id: 'r11', layer: 'move', title: 'Calisthenics & Tracks', emoji: '🤸', body: 'Outdoor pull-up parks (OSM fitness_station), public running tracks, school fields. Plyos, dips, situps.' },
  { id: 'r12', layer: 'move', title: 'Gyms & Rec Centers', emoji: '🏋️', body: 'Day passes: 24 Hour, Gold\'s, Planet Fitness, YMCA, community centers. Climbing gyms for rainy days.' },
  { id: 'r13', layer: 'move', title: 'Run / Yoga / Reset', emoji: '🧘', body: '1–6 mile loops, mat-out yoga, mobility. Shotgun watches butt-in-seat time so you don\'t rot in the car.' },
  // weird & wonderful
  { id: 'r14', layer: 'weird', title: 'Meow Wolf & Beyond', emoji: '🌀', body: 'Immersive art, Garden of 1000 Buddhas, roadside Americana, Atlas-Obscura-tier oddities.' },
  { id: 'r15', layer: 'weird', title: 'Send It Detours', emoji: '🪂', body: 'Bungee, skydive, white-water, bridge jumps — surfaced only on soft/open days when you have the time.' },
];

export const posts: Post[] = [
  { id: 'p1', title: 'Rolling out of Austin', body: 'Rig loaded — double rack, two SUPs, the e-bikes, and a porcupine-proof plan. Shotgun riding shotgun. First stop: beers in Deep Ellum.', created_at: '2026-07-03T15:00:00Z', published_at: '2026-07-03T15:00:00Z', lat: 30.2672, lng: -97.7431, media: [], author: 'David', like_count: 12, tier: 2 },
  { id: 'p2', title: 'Shelf Road sampler', body: 'Pocketed limestone and a heat that means dawn patrol only. 5.10s felt honest. Shotgun found us a creek to soak in after.', created_at: '2026-07-08T23:00:00Z', published_at: '2026-07-08T23:00:00Z', lat: 38.4, lng: -105.2, media: [], author: 'David', like_count: 8, tier: 2 },
  { id: 'p3', title: 'Into the Cirque (queued)', body: 'Big Sandy dirt road survived. No signal — this one is queued until we get Starlink back up at the rig.', created_at: '2026-07-14T01:00:00Z', published_at: null, lat: 42.7, lng: -109.2, media: [], author: 'David', like_count: 0, tier: 1 },
];

export const gear: GearItem[] = [
  // Climbing
  { id: 'g1', name: 'Double rack to 3"', category: 'Climbing', emoji: '🧗', status: 'packed', qty: 2 },
  { id: 'g2', name: 'Set of nuts + nut tool', category: 'Climbing', emoji: '🔩', status: 'packed' },
  { id: 'g3', name: 'Alpine draws', category: 'Climbing', emoji: '🪢', status: 'packed', qty: 12 },
  { id: 'g4', name: 'TC Pros', category: 'Climbing', emoji: '🥾', status: 'repair', note: 'Resole due before the Winds.' },
  { id: 'g5', name: 'Helmet', category: 'Climbing', emoji: '⛑️', status: 'packed' },
  { id: 'g6', name: '#3 Camalot', category: 'Climbing', emoji: '🔧', status: 'loaned', loaned_to: 'Derek (get it back at Flathead)' },
  // Ropes
  { id: 'g7', name: '60m half ropes', category: 'Ropes', emoji: '🧵', status: 'packed', qty: 2 },
  // Water
  { id: 'g8', name: 'Inflatable SUPs + pump', category: 'Water', emoji: '🏄', status: 'packed', qty: 2 },
  { id: 'g9', name: 'PFDs', category: 'Water', emoji: '🦺', status: 'packed', qty: 2 },
  // Bikes
  { id: 'g10', name: 'E-MTBs + rack', category: 'Bikes', emoji: '🚵', status: 'packed', qty: 2 },
  { id: 'g11', name: 'Spare tubes', category: 'Bikes', emoji: '🛞', status: 'replace', note: 'Down to one — restock.' },
  // Comms & Power
  { id: 'g12', name: 'Starlink Mini + cables', category: 'Comms & Power', emoji: '🛰️', status: 'packed' },
  { id: 'g13', name: 'EcoFlow + solar', category: 'Comms & Power', emoji: '🔋', status: 'packed' },
  { id: 'g14', name: 'inReach Mini', category: 'Comms & Power', emoji: '📡', status: 'packed', note: 'Subscription active.' },
  { id: 'g15', name: 'goTenna pair', category: 'Comms & Power', emoji: '📻', status: 'packed', qty: 2 },
  // Camp / Wildlife
  { id: 'g16', name: 'Bear canister', category: 'Camp', emoji: '🐻', status: 'packed' },
  { id: 'g17', name: 'Bear spray (chest harness)', category: 'Camp', emoji: '🧴', status: 'packed', qty: 2 },
  // Vehicle / Life
  { id: 'g18', name: 'Tire protection / recovery boards', category: 'Vehicle', emoji: '🛻', status: 'packed' },
  { id: 'g19', name: 'Wedding attire', category: 'Vehicle', emoji: '🤵', status: 'packed', note: 'For Ricardo — Aug 1!' },
  { id: 'g20', name: 'National Parks Pass', category: 'Vehicle', emoji: '🎫', status: 'packed' },
];

export const playlists = [
  { id: 'pl1', title: 'Desert Highways — indie folk', url: '#', kind: 'music', suggested_by: 'Chels' },
  { id: 'pl2', title: 'The Push — Tommy Caldwell (audiobook)', url: '#', kind: 'audiobook', suggested_by: 'Jillian' },
  { id: 'pl3', title: 'Lo-fi for long hauls', url: '#', kind: 'music', suggested_by: 'Derek' },
];

export const detours: Detour[] = [
  { id: 'd1', type: 'hot-spring', title: 'Saratoga Hobo Pool', emoji: '♨️', off_route_mi: 0.5, time_cost_min: 45, fits_slack: true, note: 'Free, 24/7, off US-287. You\'re +2hr ahead.' },
  { id: 'd2', type: 'weird', title: 'Garden of 1000 Buddhas', emoji: '🌀', off_route_mi: 8, time_cost_min: 60, fits_slack: true, note: 'Arlee, MT — on the way to Flathead.' },
  { id: 'd3', type: 'move', title: 'Public track + field', emoji: '🤸', off_route_mi: 1.2, time_cost_min: 30, fits_slack: true, note: 'You\'ve been sitting 3hrs. Mobility + a mile.' },
  { id: 'd4', type: 'skydive', title: 'Roadside skydive', emoji: '🪂', off_route_mi: 14, time_cost_min: 180, fits_slack: false, note: 'Too tight today — wedding deadline. Flag for a soft day.' },
];
