import type { APIRoute } from 'astro';
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
  const buf = await file.arrayBuffer();

  // 📍 GPS from the ORIGINAL file's EXIF (read before we re-encode, which strips it).
  // Fully isolated — if exifr can't load/parse, the upload still works (we fall back
  // to the live position). EXIF must NEVER break an upload.
  let coords: { lat: number; lng: number } | null = null;
  try {
    const exifr = (await import('exifr')).default;
    const g = await exifr.gps(buf);
    if (g && isFinite(g.latitude) && isFinite(g.longitude)) coords = { lat: g.latitude, lng: g.longitude };
  } catch (e: any) { console.log('[upload] exif skipped:', e?.message ?? e); }

  // 🗜️ Resize + compress (and HEIC→JPEG, auto-orient from EXIF). A phone photo can be
  // 15-25MB; this gets it web-friendly (a few hundred KB) and renderable everywhere.
  // Isolated — if sharp can't run we store the original so the upload never fails.
  // GIFs pass through untouched to keep animation.
  let outBuf: Buffer | ArrayBuffer = buf;
  let ext = EXT[file.type];
  let contentType = file.type;
  if (file.type !== 'image/gif') {
    try {
      const sharp = (await import('sharp')).default;
      outBuf = await sharp(Buffer.from(buf), { failOn: 'none' })
        .rotate()
        .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 82, mozjpeg: true })
        .toBuffer();
      ext = 'jpg'; contentType = 'image/jpeg';
    } catch (e: any) { console.log('[upload] resize skipped:', e?.message ?? e); }
  }

  const path = `${tid ?? 'shared'}/${id}.${ext}`;
  const { error } = await sb.storage.from('media').upload(path, outBuf, { contentType, upsert: false });
  if (error) { console.error('[upload]', error.message); return json({ ok: false, error: 'Upload failed — try again.' }, 500); }

  // Return our same-origin proxy URL (not the raw supabase.co URL) so the image
  // loads on any network — see src/pages/img/[...path].ts.
  return json({ ok: true, url: `/img/${path}`, ...(coords ?? {}) });
};

function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json' } });
}
