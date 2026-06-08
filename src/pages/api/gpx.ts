import type { APIRoute } from 'astro';
import { getSupabaseAdmin } from '../../lib/supabase';
import { supabaseServer, authConfigured } from '../../lib/supabaseServer';

export const prerender = false;

// 🛰️ Owner-only GPX upload → Supabase Storage `media` bucket, then attach to an
// objective. David exports the approach track from Gaia (phone or laptop) and drops
// it here; because HE uploaded it, we mark gpx_verified=true (his own trusted track).
// Served back through the /img proxy so it downloads even on DNS-filtered wifi.
//   POST multipart/form-data { file: <.gpx>, id: <objectiveId> }
async function ownerTenant(cookies: any, headers: Headers): Promise<string | null | { error: string; status: number }> {
  if (!authConfigured) return null;
  const supabase = supabaseServer(cookies, headers);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'not authenticated', status: 401 };
  const { data: crew } = await supabase
    .from('crew').select('tenant_id').eq('email', user.email).eq('is_owner', true).maybeSingle();
  if (!crew) return { error: 'not an owner', status: 403 };
  return crew.tenant_id;
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const tid = await ownerTenant(cookies, request.headers);
  if (tid && typeof tid === 'object') return json({ ok: false, error: tid.error }, tid.status);

  let form: FormData;
  try { form = await request.formData(); } catch { return json({ ok: false, error: 'expected multipart/form-data' }, 400); }
  const file = form.get('file');
  const objectiveId = String(form.get('id') ?? '').trim();
  if (!(file instanceof File)) return json({ ok: false, error: 'no file' }, 400);
  if (!objectiveId) return json({ ok: false, error: 'missing objective id' }, 400);
  if (!/\.gpx$/i.test(file.name)) return json({ ok: false, error: 'must be a .gpx file' }, 415);
  if (file.size > 5_242_880) return json({ ok: false, error: 'file too large (5MB max)' }, 413);

  const text = await file.text();
  if (!/<gpx[\s>]/i.test(text)) return json({ ok: false, error: 'that doesn’t look like a GPX track' }, 422);

  const sb = getSupabaseAdmin();
  if (!sb) return json({ ok: true, mock: true, url: '#' });

  const path = `${tid ?? 'shared'}/gpx/${objectiveId}.gpx`;
  const { error: upErr } = await sb.storage.from('media')
    .upload(path, text, { contentType: 'application/gpx+xml', upsert: true });
  if (upErr) { console.error('[gpx] upload', upErr.message); return json({ ok: false, error: 'Upload failed — try again.' }, 500); }

  const url = `/img/${path}`;
  let q = sb.from('objectives').update({ gpx_url: url, gpx_verified: true }).eq('id', objectiveId);
  if (tid) q = q.eq('tenant_id', tid);
  const { error: dbErr } = await q;
  if (dbErr) { console.error('[gpx] attach', dbErr.message); return json({ ok: false, error: 'Saved file but couldn’t attach it.' }, 500); }

  return json({ ok: true, url, verified: true });
};

function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json' } });
}
