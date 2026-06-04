import type { APIRoute } from 'astro';
import { lookAhead, type PoiCategory } from '../../lib/dtours/overpass';
import { getStops, getGear } from '../../lib/data';

export const prerender = false;

// Voice endpoint for the "Shotgun Detour" Siri Shortcut.
//   GET /api/ask?q=where can I shower&lat=42.83&lng=-108.73
// Returns { speech } — a short, plain-text line Siri reads aloud — plus data.
// Intent routing is simple keyword matching now; the home-iMac Claude Max agent
// can take over for real natural language later.

const CATEGORY_WORDS: Record<string, PoiCategory> = {
  water: 'water', drink: 'water',
  gas: 'fuel', fuel: 'fuel', 'fill up': 'fuel',
  shower: 'shower', wash: 'shower', clean: 'shower', shave: 'shower',
  camp: 'camp', sleep: 'camp', stay: 'camp', 'spend the night': 'camp',
  food: 'food', eat: 'food', restaurant: 'food', hungry: 'food', coffee: 'food',
  gym: 'rec_center', workout: 'fitness', pump: 'fitness', pullup: 'fitness', 'pull up': 'fitness',
  run: 'track', track: 'track', jog: 'track',
  climb: 'climbing', 'climbing gym': 'climbing',
  view: 'viewpoint', scenic: 'viewpoint', viewpoint: 'viewpoint',
};

export const GET: APIRoute = async ({ url }) => {
  const q = (url.searchParams.get('q') ?? '').toLowerCase().trim();
  const lat = Number(url.searchParams.get('lat') ?? 42.833);
  const lng = Number(url.searchParams.get('lng') ?? -108.73);

  // ⚡ IMMEDIATE INTERRUPT — saying "Shotgun Detour" (alone) means "detour me NOW."
  // Foreground burst: scan the corridor this instant across categories and hand back
  // ranked options. Distinct from the ambient event loop that passively watches + pings.
  if (!q || /^(shotgun detour|detour( now| me)?|surprise me|something (fun|cool|weird)|options now|what'?s (around|nearby))$/.test(q)) {
    const found = await lookAhead({
      lat, lng, radiusM: 30000,
      categories: ['viewpoint', 'water_body', 'camp', 'food', 'fuel', 'water'],
    });
    if (!found.length) return speak("Scanning now — nothing jumping out right here. I'll keep watching and ping you the second something good lands.");
    const top = found.sort((a, b) => a.off_route_mi - b.off_route_mi).slice(0, 3);
    const list = top.map((d) => `${d.title}, ${d.off_route_mi} miles`).join('; ');
    return speak(`On it. Three within reach right now: ${list}. Which one?`, { mode: 'interrupt', detours: top });
  }

  // status / orientation
  if (!q.includes('gear') && /(where am i|status|schedule|deadline|how far|next stop|wedding)/.test(q)) {
    const stops = await getStops();
    const live = stops.filter((s) => (s.status ?? 'confirmed') === 'confirmed').sort((a, b) => a.order - b.order);
    const hard = live.find((s) => s.flex === 'hard');
    const next = live[1];
    const parts = [`Next up is ${next?.name ?? 'the open road'}.`];
    if (hard) parts.push(`Hard deadline: ${hard.name} on ${hard.date}. Don't blow it.`);
    return speak(parts.join(' '), { next: next?.name, deadline: hard?.name });
  }

  // staging a stop
  if (/^(add|stop at|let's hit|pull over|put)/.test(q)) {
    return speak(`Roger — staging that as a proposed stop. Reply yes to lock it into the itinerary.`, { action: 'proposed' });
  }

  // gear lookup — "did I pack the rack?", "where's my bear spray?", "gear status"
  if (/(did i (pack|bring)|where('?s| is) my|do i have|gear|packed|pack)/.test(q)) {
    const gear = await getGear();
    // score each item by # of distinctive words matched; best wins (so "bear
    // spray" beats "bear canister")
    let best: any = null, bestScore = 0;
    for (const g of gear) {
      const score = g.name.toLowerCase().split(/\W+/).filter((w) => w.length > 3 && q.includes(w)).length;
      if (score > bestScore) { bestScore = score; best = g; }
    }
    if (best) {
      const where = best.status === 'packed' ? `packed${best.qty && best.qty > 1 ? ` (×${best.qty})` : ''}`
        : best.status === 'loaned' ? `loaned to ${best.loaned_to}` : best.status;
      return speak(`${best.name}: ${where}.${best.note ? ` ${best.note}` : ''}`, { gear: best });
    }
    if (/(gear|packed|pack)/.test(q)) {
      const attention = gear.filter((g) => g.status !== 'packed');
      if (attention.length) return speak(`${gear.filter((g) => g.status === 'packed').length} of ${gear.length} packed. Needs attention: ${attention.map((g) => g.name).join(', ')}.`, { attention });
      return speak('All gear packed and accounted for. 🤘');
    }
    // "where's my X" with no gear match → fall through to other intents
  }

  // category detour
  const cat = matchCategory(q);
  if (cat) {
    const found = await lookAhead({ lat, lng, radiusM: 25000, categories: [cat] });
    if (!found.length) return speak(`Nothing for ${cat} showing up in the next stretch. I'll keep scanning.`);
    const best = found.sort((a, b) => a.off_route_mi - b.off_route_mi)[0];
    return speak(
      `${best.title} is ${best.off_route_mi} miles off-route, about ${best.time_cost_min} minutes. Want it?`,
      { detour: best },
    );
  }

  return speak("I didn't catch a detour in that. Try: where can I shower, find me gas, somewhere to camp, or what's my deadline.");
};

export const POST = GET;

function matchCategory(q: string): PoiCategory | null {
  for (const [word, cat] of Object.entries(CATEGORY_WORDS)) if (q.includes(word)) return cat;
  return null;
}

function speak(speech: string, data: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ speech, ...data }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
