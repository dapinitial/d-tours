import type { APIRoute } from 'astro';
import exifr from 'exifr';
import { getSupabaseAdmin } from '../../lib/supabase';
import { supabaseServer, authConfigured } from '../../lib/supabaseServer';

export const prerender = false;

// Owner-only media upload → Supabase Storage `media` bucket (public read).
// Returns the public URL, which the post composer stores in posts.media[].
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

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic',
};

export const POST: APIRoute = async ({ request, cookies }) => {
  const tid = await ownerTenant(cookies, request.headers);
  if (tid && typeof tid === 'object') return json({ ok: false, error: tid.error }, tid.status);

  let form: FormData;
  try { form = await request.formData(); } catch { return json({ ok: false, error: 'expected multipart/form-data' }, 400); }
  const file = form.get('file');
  if (!(file instanceof File)) return json({ ok: false, error: 'no file' }, 400);
  if (!EXT[file.type]) return json({ ok: false, error: 'unsupported type' }, 415);
  if (file.size > 26214400) return json({ ok: false, error: 'file too large (25MB max)' }, 413);

  const sb = getSupabaseAdmin();
  if (!sb) return json({ ok: true, mock: true, url: URL.createObjectURL?.(file) ?? '#' });

  const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const path = `${tid ?? 'shared'}/${id}.${EXT[file.type]}`;
  const buf = await file.arrayBuffer();

  // 📍 Pull GPS out of the photo's EXIF (where it was actually taken).
  let coords: { lat: number; lng: number } | null = null;
  try {
    const g = await exifr.gps(buf);
    if (g && isFinite(g.latitude) && isFinite(g.longitude)) coords = { lat: g.latitude, lng: g.longitude };
  } catch { /* no EXIF / unsupported — fine, we'll fall back to the live position */ }

  const { error } = await sb.storage.from('media').upload(path, buf, { contentType: file.type, upsert: false });
  if (error) { console.error('[upload]', error.message); return json({ ok: false, error: 'Upload failed — try again.' }, 500); }

  const { data } = sb.storage.from('media').getPublicUrl(path);
  return json({ ok: true, url: data.publicUrl, ...(coords ?? {}) });
};

function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json' } });
}
