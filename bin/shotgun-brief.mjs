#!/usr/bin/env node
// 🧠 Shotgun local morning-brief — runs on David's laptop via Claude Max (headless
// `claude -p`), online via Starlink/hotspot. It pulls the in-range climbs + live
// weather from the prod app, asks your LOCAL Claude for the day's call (your Max
// plan — no API key, no per-token cost), and emails it back through the app's SMTP.
//
// Run by hand:   WATCH_TOKEN=wt_… node bin/shotgun-brief.mjs
// Or scheduled:  see bin/com.shotgun.brief.plist (launchd).
//
// Env:
//   WATCH_TOKEN   (required)  — same token as the cloud watcher
//   SHOTGUN_URL   (optional)  — default https://www.shotgundetour.com
//   BRIEF_HOURS   (optional)  — drive-radius for "in range", default 4
// Needs the `claude` CLI installed + logged in to your Max account.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const pexec = promisify(execFile);

const BASE = (process.env.SHOTGUN_URL || 'https://www.shotgundetour.com').replace(/\/+$/, '');
const TOKEN = process.env.WATCH_TOKEN;
const HOURS = process.env.BRIEF_HOURS || '4';
if (!TOKEN) { console.error('✗ Set WATCH_TOKEN'); process.exit(1); }

// 1) Pull the context (live position + in-range climbs + forecast + journal).
const ctxRes = await fetch(`${BASE}/api/brief?token=${encodeURIComponent(TOKEN)}&hours=${HOURS}`);
const ctx = await ctxRes.json().catch(() => ({}));
if (!ctx.ok) { console.error('✗ context fetch failed:', ctx.error ?? ctxRes.status); process.exit(1); }
if (!ctx.candidates?.length) { console.log('· Nothing in range (or no live fix) —', ctx.skipped ?? 'no candidates'); process.exit(0); }

// 2) Build the prompt for local Claude.
const climbLines = ctx.candidates.map((c, i) =>
  `${i + 1}. ${c.name} — ${c.grade} · ${c.dayType ?? 'day-type?'}${c.discipline ? ` · ${c.discipline}` : ''} · ~${c.hrs}h/${c.miles}mi${c.status === 'proposed' ? ' (swap being weighed)' : ''}\n` +
  `   hazard: ${c.hazard ?? 'n/a'} (${c.severity ?? 'med'})\n` +
  `   forecast: ${(c.forecast ?? []).map((d) => `${d.date}: ${Math.round(d.tmin)}–${Math.round(d.tmax)}°F, ${d.precipProb}% precip, wind ${Math.round(d.wind)}mph`).join(' | ') || 'no forecast on file'}` +
  (c.signal ? `\n   cell: ${c.signal}` : '')
).join('\n');
const recent = ctx.recent?.length ? ctx.recent.map((p) => `- ${p.title}${p.when ? ` (${p.when})` : ''}`).join('\n') : '(none)';

const prompt = `You are Shotgun, the AI co-pilot for David & his brother's climbing road trip (Austin → Pacific Northwest → Squamish). Write his MORNING CALL: which climb to do today, or whether to rest — and why.

Reason over:
- WEATHER WINDOW: favor the best forecast; flag rain, high wind, or afternoon-storm risk. A wet/stormy alpine day is a no-go.
- DAY FIT: today is ${ctx.weekday} (${ctx.isWeekend ? 'WEEKEND — green-light a big ALPINE objective' : 'WEEKDAY — he works from the road, so lean a CRAG near town/cell that fits around work'}).
- REST: if the recent journal shows several hard days running, calling a rest or chill cragging day is fair.
- DRIVE + SPICE: weigh the drive time; be honest about R/X runouts, sandbags, lightning, wildfire smoke, grizzlies, altitude.

VOICE: warm, dry, outdoorsy, a little stoke. 2–4 sentences, lead with the call. Emoji as signal, not decoration. NEVER invent grades or beta — reason only from what's below. Output ONLY the brief text — no preamble, no sign-off, no markdown headers.

Live fix: ${ctx.position?.when ?? 'recent'}.

CLIMBS IN RANGE:
${climbLines}

RECENT JOURNAL (how hard he's been pushing lately):
${recent}`;

// 3) Ask local Claude (Max). A pure reasoning task — no tools needed.
let brief = '';
try {
  const { stdout } = await pexec('claude', ['-p', prompt], { maxBuffer: 4 * 1024 * 1024, timeout: 150000 });
  brief = stdout.trim();
} catch (e) {
  console.error('✗ `claude -p` failed (is the CLI installed + logged in?):', e?.message ?? e);
  process.exit(1);
}
if (!brief) { console.error('✗ empty brief from claude'); process.exit(1); }

// 4) Email it back through the app (links appended).
const subject = ctx.candidates.length === 1
  ? `🛰️ Shotgun’s call: ${ctx.candidates[0].name}`
  : `🛰️ Shotgun’s morning call — ${ctx.candidates.length} climbs in range`;
const linkBlock = ctx.candidates.map((c) => `🧗 ${c.name} — ${c.grade}\n   ${c.url}`).join('\n\n');
const fullBody = `${brief}\n\n— — —\n${linkBlock}`;

const sendRes = await fetch(`${BASE}/api/brief?token=${encodeURIComponent(TOKEN)}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ text: fullBody, subject }),
});
const sent = await sendRes.json().catch(() => ({}));
console.log(sent.ok ? `✓ Brief sent (${ctx.candidates.length} climbs in range)` : `✗ send failed: ${JSON.stringify(sent)}`);
process.exit(sent.ok ? 0 : 1);
