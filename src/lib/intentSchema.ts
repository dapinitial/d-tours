// Sonnet-powered first-draft of a trip's dossier section schema from its free-text
// intent ("BBQ crawl through Texas" → BBQ JOINTS / DRIVE / STAYS). One-shot, at trip
// creation. Returns null when the key is unset or the model misbehaves, so the caller
// simply keeps the generic fallback that provision_trip already stamped — onboarding
// never hard-fails. Sonnet (not Haiku) because it's a one-time reasoning task; the cost
// is bounded to once per trip.
import Anthropic from '@anthropic-ai/sdk';
import { isValidSchema, type SectionSchema } from './sectionSchema.ts';

const SONNET = process.env.SCHEMA_MODEL || 'claude-sonnet-4-6';

const SYSTEM = `You design "dossier section schemas" for a travel-planning app. Given a traveler's free-text trip intent, return the sections their day-by-day dossier should have — tailored to the activity. A climber needs ROUTES/GEAR/SKILLS; a road-tripper needs PACKING LIST/EATS/FUEL; a World Cup fan needs MATCH DAY/TICKETS/TRANSIT; a scuba diver needs DIVE SITES/GEAR/CERTS.

Rules:
- Output ONLY a single JSON object, no prose, no markdown fences.
- Shape: {"sections":[{"key":"snake_case","label":"Title Case","icon":"<one emoji>","fields":["snake_case",...]}]}
- 4 to 6 sections. Each section: a short human label, one relevant emoji, and 1-4 lowercase snake_case field keys for the data it holds.
- Always include a "Packing List" style section unless clearly irrelevant.
- Keep keys generic and reusable (e.g. "food","sleep","gas","tickets","essentials").`;

/** Pure: pull the first JSON object out of a model response and validate it. Testable without the API. */
export function parseSchemaResponse(text: string | null | undefined): SectionSchema | null {
  if (!text) return null;
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const obj = JSON.parse(m[0]);
    return isValidSchema(obj) ? obj : null;
  } catch {
    return null;
  }
}

/** Generate a tailored schema, or null to keep the fallback. Never throws. */
export async function generateSectionSchema(intent: string): Promise<SectionSchema | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || !intent?.trim()) return null;
  try {
    const client = new Anthropic({ apiKey: key });
    const resp: any = await client.messages.create({
      model: SONNET, max_tokens: 700, system: SYSTEM,
      messages: [{ role: 'user', content: `Trip intent: ${intent.slice(0, 400)}` }],
    });
    const text = resp.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
    return parseSchemaResponse(text);
  } catch (e: any) {
    console.error('[intentSchema]', e?.message ?? e);
    return null;
  }
}
