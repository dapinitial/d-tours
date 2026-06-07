import type { APIRoute } from 'astro';
import Anthropic from '@anthropic-ai/sdk';
import { getStops, getObjectives, getProposedObjectives, getDefaultTenant } from '../../lib/data';
import { getSupabaseAdmin } from '../../lib/supabase';

export const prerender = false;

// Tool: stage a climbing alternative as 'proposed' for David to review (it does NOT
// touch the confirmed plan — proposed objectives are hidden from the public list and
// promoted only from the CMS). This is the chat *doing* something, safely.
const TOOLS = [{
  name: 'stage_proposal',
  description: "Stage a climbing alternative for David to review on the 'Help us decide' board. Use ONLY when someone proposes/wants a specific climb added as an option (a swap, a harder/easier line, a nearby classic) and would clearly want it on the review list. Not for general questions. It's a suggestion queue — owner-reviewed before anything changes.",
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Route/objective name, e.g. "Petit Grepon — South Face"' },
      grade: { type: 'string', description: 'Climbing grade, e.g. "III 5.8"' },
      region: { type: 'string', description: 'Area/region, e.g. "RMNP, CO"' },
      note: { type: 'string', description: 'One line: why it fits / what it swaps for' },
    },
    required: ['name'],
  },
}];

async function stageProposal(input: any) {
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, error: 'storage unavailable' };
  const tenant = await getDefaultTenant();
  const id = 'prop-' + ((globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random()}`).replace(/-/g, '').slice(0, 10));
  const row: any = {
    id, name: String(input?.name ?? '').slice(0, 160),
    grade: input?.grade ? String(input.grade).slice(0, 40) : '?',
    region: input?.region ? String(input.region).slice(0, 80) : null,
    status: 'proposed', note: (input?.note ? String(input.note).slice(0, 240) : 'Suggested via Shotgun chat'),
    ...(tenant ? { tenant_id: tenant.id } : {}),
  };
  if (!row.name) return { ok: false, error: 'name required' };
  const { error } = await sb.from('objectives').insert(row);
  return error ? { ok: false, error: error.message } : { ok: true, id, staged: row.name };
}

// Conversational Shotgun. Trip-aware Q&A + pivot suggestions, powered by the
// Anthropic API. Needs ANTHROPIC_API_KEY. Public-facing → keep it cheap (Haiku)
// and capped. It SUGGESTS; it doesn't write to the trip (that stays owner-gated).
// User-pickable models (the chat switcher). All Anthropic API (paid); Haiku is
// cheapest, Opus smartest. Defaults to Haiku / the SHOTGUN_MODEL override.
const MODELS: Record<string, string> = {
  haiku: 'claude-haiku-4-5',
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-8',
};
const DEFAULT_MODEL = process.env.SHOTGUN_MODEL || 'claude-haiku-4-5';

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

WHAT YOU DO: answer trip questions, give climbing beta, and suggest alternatives ("an equally classic but more moderate/harder line near X"). When someone wants to swap a climb, suggest 1-3 real options with grade + a one-line why, factoring the Aug-1 slack. Be honest about hazards (lightning, grizzlies, altitude, heat).

STAGING: you can't change the confirmed plan, but you CAN stage an alternative for review with the stage_proposal tool — it lands on David's "Help us decide" board (owner-reviewed; promoted to the itinerary only from the CMS). Use it when someone clearly wants a specific climb added as an option to weigh, then tell them it's staged for David to review. Don't stage for vague chatter or general questions. Never invent fake routes; if unsure of a real line, say so rather than staging something made up.

If asked something off-topic, gently steer back to the trip.`;

  const model = MODELS[String(body.model)] || DEFAULT_MODEL;
  try {
    const client = new Anthropic({ apiKey: key });
    const convo: any[] = [...messages];
    const staged: string[] = [];
    let reply = '';
    for (let turn = 0; turn < 3; turn++) {
      const resp: any = await client.messages.create({ model, max_tokens: 700, system, messages: convo, tools: TOOLS as any });
      reply = resp.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('').trim();
      const toolUses = resp.content.filter((b: any) => b.type === 'tool_use');
      if (resp.stop_reason !== 'tool_use' || !toolUses.length) break;
      convo.push({ role: 'assistant', content: resp.content });
      const results: any[] = [];
      for (const tu of toolUses) {
        const out = tu.name === 'stage_proposal' ? await stageProposal(tu.input) : { ok: false, error: 'unknown tool' };
        if ((out as any).ok && (out as any).staged) staged.push((out as any).staged);
        results.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(out) });
      }
      convo.push({ role: 'user', content: results });
    }
    return json({ ok: true, reply: reply || "…lost signal for a sec. Try again?", staged });
  } catch (e: any) {
    console.error('[chat]', e?.message ?? e);
    return json({ ok: false, reply: "Hit a snag reaching Shotgun — try again in a sec." }, 502);
  }
};

function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json' } });
}
