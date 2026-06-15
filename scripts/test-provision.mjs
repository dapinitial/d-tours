// Smoke test for provision_trip (slice 5). Creates a throwaway user, calls the RPC
// as that user, verifies the template clone + idempotency, then tears down.
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
process.loadEnvFile('.env');
const url = process.env.PUBLIC_SUPABASE_URL, anonKey = process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY, secret = process.env.SUPABASE_SECRET_KEY;
const admin = createClient(url, secret, { auth: { persistSession: false } });
const results = [];
const check = (n, p, d = '') => { results.push(p); console.log(`${p ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`); };

const TAG = 'prov-' + randomUUID().slice(0, 8);
const email = `${TAG}@audit.local`, password = 'Aud!t-' + randomUUID();
let userId, tid;
try {
  const { data: u } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  userId = u.user.id;
  const signer = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: s } = await signer.auth.signInWithPassword({ email, password });
  const uc = createClient(url, anonKey, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${s.session.access_token}` } } });

  const { data: prov, error } = await uc.rpc('provision_trip', { p_intent: 'World Cup in Seattle then a PNW road trip', p_name: 'My World Cup Trip' });
  check('provision_trip returns a tenant', !error && prov?.[0]?.tenant_id, error?.message ?? '');
  tid = prov?.[0]?.tenant_id;
  check('slug is generated', !!prov?.[0]?.slug, prov?.[0]?.slug);

  // verify clone via admin (bypass RLS)
  const cnt = async (t) => (await admin.from(t).select('id').eq('tenant_id', tid)).data?.length ?? 0;
  check('cloned 3 chapters', (await cnt('chapters')) === 3);
  check('cloned 5 stops', (await cnt('stops')) === 5);
  check('cloned 2 objectives', (await cnt('objectives')) === 2);

  // stop→chapter link survived the id remap
  const { data: linkedStops } = await admin.from('stops').select('id,chapter_id').eq('tenant_id', tid).not('chapter_id', 'is', null);
  const { data: chapIds } = await admin.from('chapters').select('id').eq('tenant_id', tid);
  const chapSet = new Set(chapIds.map((c) => c.id));
  check('stop chapter_id links resolve to cloned chapters', linkedStops.length > 0 && linkedStops.every((s) => chapSet.has(s.chapter_id)));

  // new trip is private + has the fallback schema + intent stored
  const { data: t } = await admin.from('tenants').select('visibility,section_schema,intent_text').eq('id', tid).single();
  check('new trip is private', t.visibility === 'private');
  check('fallback section_schema stamped', !!t.section_schema?.sections?.length);
  check('intent_text stored', /World Cup/.test(t.intent_text ?? ''));

  // owner via the user's auth_user_id
  const { data: crew } = await admin.from('crew').select('is_owner,can_write,auth_user_id').eq('tenant_id', tid).single();
  check('owner crew row linked to auth user', crew.is_owner && crew.can_write && crew.auth_user_id === userId);

  // idempotency: second call returns the SAME tenant (no second trip)
  const { data: again } = await uc.rpc('provision_trip', { p_intent: 'x', p_name: 'y' });
  check('idempotent: same tenant on 2nd call', again?.[0]?.tenant_id === tid);
  check('still exactly one owned tenant', (await admin.from('tenants').select('id').eq('owner_id', userId)).data.length === 1);
} catch (e) {
  check('run', false, e.message);
} finally {
  if (tid) { for (const t of ['stops', 'objectives', 'chapters', 'crew']) await admin.from(t).delete().eq('tenant_id', tid); await admin.from('tenants').delete().eq('id', tid); }
  if (userId) await admin.auth.admin.deleteUser(userId);
  console.log('🧹 torn down');
}
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
