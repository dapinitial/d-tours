import Anthropic from '@anthropic-ai/sdk';

// 🧠 Smart-watcher brief. When the proximity watcher finds NEW climbs in range, this
// turns the bare list into a real recommendation — reasoning over the weather window,
// crag-vs-alpine fit for the day, how hard David's been pushing (journal), and the
// drive/spice. Cheap + fast (Haiku), one-shot, fires only on a real proximity trigger.
//
// Returns null if unconfigured (no ANTHROPIC_API_KEY) or on ANY error, so the watcher
// always falls back to the plain list — the brain is an enhancement, never a blocker.
// Mirrors the existing Anthropic integration in src/pages/api/chat.ts.

export type BriefCandidate = {
  name: string;
  grade: string;
  dayType?: string | null;
  discipline?: string | null;
  hrs: number;
  miles: number;
  hazard?: string | null;
  severity?: string | null;
  status?: string | null;
  signal?: string | null;
  forecast?: { date: string; tmax: number; tmin: number; precipProb: number; wind: number }[];
};

export type BriefCtx = {
  weekday: string;       // local day name ("Saturday")
  isWeekend: boolean;    // green-light alpine vs. work-from-road crag
  whenFix?: string | null;
  candidates: BriefCandidate[];
  recent?: { title: string; when?: string | null }[]; // recent journal = rest signal
};

// Haiku is the right tier here: cheap, fast, one-shot. Owner can override.
const MODEL = process.env.SHOTGUN_BRIEF_MODEL || 'claude-haiku-4-5';

export async function smartBrief(ctx: BriefCtx): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || !ctx.candidates.length) return null;

  const fc = (c: BriefCandidate) =>
    (c.forecast ?? []).slice(0, 3).map((d) =>
      `${d.date}: ${Math.round(d.tmin)}–${Math.round(d.tmax)}°F, ${d.precipProb}% precip, wind ${Math.round(d.wind)}mph`
    ).join(' | ') || 'no forecast on file';

  const climbLines = ctx.candidates.map((c, i) =>
    `${i + 1}. ${c.name} — ${c.grade} · ${c.dayType ?? 'day-type?'}${c.discipline ? ` · ${c.discipline}` : ''} · ~${c.hrs}h / ${c.miles}mi away${c.status === 'proposed' ? ' (a swap being weighed)' : ''}\n` +
    `   hazard: ${c.hazard ?? 'n/a'} (${c.severity ?? 'med'})\n` +
    `   forecast: ${fc(c)}` +
    (c.signal ? `\n   cell signal: ${c.signal}` : '')
  ).join('\n');

  const recent = ctx.recent?.length
    ? ctx.recent.map((p) => `- ${p.title}${p.when ? ` (${p.when})` : ''}`).join('\n')
    : '(no recent journal entries)';

  const system = `You are Shotgun, the AI co-pilot for David & his brother's climbing road trip (Austin → Pacific Northwest → Squamish). You're firing a PROACTIVE text because new climbs just came into range of his live GPS position.

VOICE: warm, dry, outdoorsy, a little stoke — never corny. Text-message length: 2 to 4 sentences, lead with the call. Emoji as signal, not decoration.

YOUR JOB: don't just relist the climbs — make ONE clear recommendation, reasoning over:
- WEATHER WINDOW: favor the climb (or day) with the best forecast; flag rain, high wind, or afternoon-storm risk. A wet or stormy alpine day is a no-go.
- DAY FIT: today is ${ctx.weekday} (${ctx.isWeekend ? 'WEEKEND — green-light a big ALPINE objective' : 'WEEKDAY — he works from the road, so lean a CRAG near town/cell that fits around work'}).
- REST: if the recent journal shows several hard days running, it's fine to call a rest day or a chill cragging day instead.
- DRIVE + SPICE: weigh the drive time, and be honest about R/X runouts, sandbags, lightning, wildfire smoke, grizzlies, and altitude.

Be decisive: name the climb you'd do (or say rest), with one line of why. If nothing fits — all wet, too far, or he's cooked — say that plainly. NEVER invent grades or beta; reason only from what's given here.`;

  const user = `Live fix: ${ctx.whenFix ?? 'just now'}.

NEW CLIMBS IN RANGE:
${climbLines}

RECENT JOURNAL (how hard he's been pushing lately):
${recent}

Give me the call.`;

  try {
    const client = new Anthropic({ apiKey: key });
    // Haiku: no effort / adaptive-thinking params (those 400 on Haiku 4.5).
    const resp: any = await client.messages.create({
      model: MODEL,
      max_tokens: 400,
      system,
      messages: [{ role: 'user', content: user }],
    });
    const text = resp.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('').trim();
    return text || null;
  } catch (e: any) {
    console.error('[brief]', e?.message ?? e);
    return null;
  }
}
