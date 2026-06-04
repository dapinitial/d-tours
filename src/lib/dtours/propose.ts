// Turn a D-Tours detour into a staged itinerary item + the Shotgun text that
// asks David to confirm it. This is the "system finds a side-quest → adds it on
// the fly → pings you" bridge. Pit-stops (gas/water) come in as `suggested`
// (low-stakes auto-lane); bigger side-quests as `proposed` (needs your 👍).
import type { Detour, Stop } from '../types';

const PITSTOP_TYPES = new Set(['water', 'fuel', 'shower', 'gas', 'rec_center', 'track', 'fitness']);

export function detourToStop(d: Detour, insertAfterOrder: number): Stop {
  const isPit = PITSTOP_TYPES.has(d.type);
  return {
    id: d.id,
    order: insertAfterOrder + 0.5,
    name: d.title,
    sub: `${isPit ? 'Pit-stop' : 'Side-quest'} · ${d.type}`,
    emoji: d.emoji,
    flex: 'open',
    status: isPit ? 'suggested' : 'proposed',
    kind: isPit ? 'pitstop' : 'sidequest',
    source: 'shotgun',
    off_route_mi: d.off_route_mi,
    time_cost_min: d.time_cost_min,
    note: d.note,
  };
}

/** The approval message Shotgun texts you (compressed for SMS/inReach). */
export function approvalMessage(s: Stop): { subject: string; body: string; short: string } {
  const cost = s.off_route_mi != null ? ` ${s.off_route_mi}mi · ~${s.time_cost_min}min` : '';
  const ask = s.status === 'proposed' ? 'Add it? (reply YES)' : 'Auto-added to suggestions.';
  return {
    subject: `${s.emoji} ${s.name}`,
    body: `${s.emoji} ${s.name}${cost}${s.note ? `\n${s.note}` : ''}\n${ask}`,
    short: `${s.emoji} ${s.name}${cost} — ${ask}`.slice(0, 140),
  };
}
