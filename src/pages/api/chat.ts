import type { APIRoute } from 'astro';
import Anthropic from '@anthropic-ai/sdk';
import { getStops, getObjectives, getProposedObjectives } from '../../lib/data';

export const prerender = false;

// Conversational Shotgun. Trip-aware Q&A + pivot suggestions, powered by the
// Anthropic API. Needs ANTHROPIC_API_KEY. Public-facing → keep it cheap (Haiku)
// and capped. It SUGGESTS; it doesn't write to the trip (that stays owner-gated).
const MODEL = process.env.SHOTGUN_MODEL || 'claude-haiku-4-5';

export const POST: APIRoute = async ({ request }) => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return json({ ok: false, reply: "Shotgun's voice isn't wired up yet — the owner needs to set ANTHROPIC_API_KEY." });
  }

  let body: any = {};
  try { body = await request.json(); } catch {}
  const incoming: { role: string; content: string }[] = Array.isArray(body.messages) ? body.messages : [];
  // Sanitize + cap history (cost/abuse guard).
  const messages = incoming
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-10)
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content.slice(0, 1500) }));
  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    return json({ ok: false, reply: 'Say something and I’ll ride shotgun.' }, 400);
  }

  // Compact trip context for the system prompt.
  const [stops, objectives, proposed] = await Promise.all([getStops(), getObjectives(), getProposedObjectives()]);
  const routeLine = stops.sort((a, b) => a.order - b.order).map((s) => s.name).join(' → ');
  const climbLine = objectives.map((o) => `${o.name} (${o.grade}, ${o.region})`).join('; ');
  const propLine = proposed.length ? proposed.map((o) => `${o.name} (${o.grade}, ${o.region}) — ${o.note ?? ''}`).join('; ') : 'none';

  const system = `You are Shotgun, the AI co-pilot for David & his brother Derek's climbing road trip. You're chatting on the trip's public website — the person could be David, Derek, a climbing partner, or a friend/family member following along.

VOICE: warm, dry, outdoorsy, a little stoke, never corny. Be BRIEF and scannable — text-message length, lead with the answer. Emoji as signal, not decoration.

THE TRIP: Austin → Pacific Northwest → Squamish. The one hard deadline: Ricardo's wedding in SPOKANE on AUG 1 — everything before it is a dash to make the wedding; after it is open-ended. Reason about slack vs that deadline when relevant.

ROUTE: ${routeLine}
CLIMBING OBJECTIVES: ${climbLine}
ALTERNATIVES BEING WEIGHED: ${propLine}

WHAT YOU DO: answer trip questions, give climbing beta, and suggest alternatives ("an equally classic but more moderate/harder line near X"). When someone wants to swap a climb, suggest 1-3 real options with grade + a one-line why, factoring the Aug-1 slack. Be honest about hazards (lightning, grizzlies, altitude, heat). You can SUGGEST but not change the plan — point them to the dossiers (/objectives) or tell them David promotes picks in the CMS. If asked something off-topic, gently steer back to the trip. Never invent fake facts; if unsure, say so.`;

  try {
    const client = new Anthropic({ apiKey: key });
    const resp = await client.messages.create({ model: MODEL, max_tokens: 600, system, messages });
    const reply = resp.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('').trim();
    return json({ ok: true, reply: reply || "…lost signal for a sec. Try again?" });
  } catch (e: any) {
    console.error('[chat]', e?.message ?? e);
    return json({ ok: false, reply: "Hit a snag reaching Shotgun — try again in a sec." }, 502);
  }
};

function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json' } });
}
