// Compose Shotgun's "day ahead" digest from the itinerary. This is the v1
// rules-based composer; later the home-iMac Claude Max agent rewrites it in
// Shotgun's voice and folds in live detours + weather.
import type { Stop, Detour } from '../types';

export interface DigestInput {
  today: Stop;
  next?: Stop;
  hardDeadline?: Stop;
  detours?: Detour[];
  sittingHours?: number;
}

/** Rich body (email). */
export function composeDigest(input: DigestInput): { subject: string; body: string; short: string } {
  const { today, next, hardDeadline, detours = [], sittingHours } = input;
  const lines: string[] = [];
  lines.push(`☀️ Good morning. Today: ${today.name}${today.sub ? ` — ${today.sub}` : ''}.`);
  if (today.rendezvous) lines.push(`🤝 Rendezvous: ${today.rendezvous}.`);
  if (next) lines.push(`➡️ Next up: ${next.name}${next.date ? ` (${next.date})` : ''}.`);
  if (hardDeadline) {
    lines.push(`⏰ Hard deadline: ${hardDeadline.name} — ${hardDeadline.date}. Don't blow it.`);
  }
  const fits = detours.filter((d) => d.fits_slack);
  if (fits.length) {
    lines.push('', '🌀 Detours that fit your slack today:');
    for (const d of fits.slice(0, 4)) {
      lines.push(`  ${d.emoji} ${d.title} · ${d.off_route_mi}mi off-route · ~${d.time_cost_min}min${d.note ? ` · ${d.note}` : ''}`);
    }
  }
  if (sittingHours && sittingHours >= 3) {
    lines.push('', `🤸 You've been seated ~${sittingHours}h — find a field/track for a quick mobility flow + a mile.`);
  }
  const subject = `Shotgun · ${today.name} day-ahead`;
  const short = shortLine(input);
  return { subject, body: lines.join('\n'), short };
}

/** Compressed one-liner for SMS / inReach. */
export function shortLine(input: DigestInput): string {
  const { today, hardDeadline, detours = [] } = input;
  const top = detours.find((d) => d.fits_slack);
  const dl = hardDeadline ? ` | ${hardDeadline.name} ${hardDeadline.date}` : '';
  const tip = top ? ` | ${top.emoji}${top.title} ${top.off_route_mi}mi/${top.time_cost_min}min` : '';
  return `Today: ${today.name}${dl}${tip}`.slice(0, 140);
}
