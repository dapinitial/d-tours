// Smoke test for provision_trip (scratch default + template opt-in). Creates throwaway
// users, calls the RPC as each, verifies the result, then tears down.
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
process.loadEnvFile('.env');
const url = process.env.PUBLIC_SUPABASE_URL, anon = process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY, secret = process.env.SUPABASE_SECRET_KEY;
const admin = createClient(url, secret, { auth: { persistSession: false } });
const results = [];
const check = (n, p, d = '') => { results.push(p); console.log(`${p ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`); };
const TAG = 'prov-' + randomUUID().slice(0, 8);
const made = [];

async function userClient(label) {
  const email = `${TAG}-${label}@audit.local`, password = 'Aud!t-' + randomUUID();
  const { data: u } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  made.push(u.user.id);
  const signer = createClient(url, anon, { auth: { persistSession: false } });
  const { data: s } = await signer.auth.signInWithPassword({ email, password });
  return { email, uc: createClient(url, anon, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${s.session.access_token}` } } }) };
}
const cnt = async (t, tid) => (await admin.from(t).select('id').eq('tenant_id', tid)).data?.length ?? 0;

const tids = [];
try {
  // ── scratch (default) ──
  const A = await userClient('scratch');
  const { data: pa, error: ea } = await A.uc.rpc('provision_trip', { p_intent: 'BBQ crawl through Texas', p_name: 'BBQ Run' });
  const ta = pa?.[0]?.tenant_id; if (ta) tids.push(ta);
  check('scratch: provisions a trip', !ea && !!ta, ea?.message ?? '');
  check('scratch: 1 starter chapter', (await cnt('chapters', ta)) === 1);
  check('scratch: 0 stops (not template)', (await cnt('stops', ta)) === 0);
  check('scratch: 0 objectives (not template)', (await cnt('objectives', ta)) === 0);
  const { data: t1 } = await admin.from('tenants').select('visibility,intent_text,location_sharing,section_schema').eq('id', ta).single();
  check('scratch: private + intent stored', t1.visibility === 'private' && /BBQ/.test(t1.intent_text ?? ''));
  check('scratch: new trip defaults to approximate location', t1.location_sharing === 'approximate');
  check('scratch: fallback section_schema stamped', !!t1.section_schema?.sections?.length);

  // ── template opt-in ──
  const B = await userClient('template');
  const { data: pb, error: eb } = await B.uc.rpc('provision_trip', { p_intent: 'climbing the Cascades', p_name: 'Cascades Trip', p_from_template: true });
  const tb = pb?.[0]?.tenant_id; if (tb) tids.push(tb);
  check('template: provisions a trip', !eb && !!tb, eb?.message ?? '');
  check('template: cloned 3 chapters', (await cnt('chapters', tb)) === 3);
  check('template: cloned 5 stops', (await cnt('stops', tb)) === 5);
  check('template: cloned 2 objectives', (await cnt('objectives', tb)) === 2);
} catch (e) {
  check('run', false, e.message);
} finally {
  for (const tid of tids) { for (const t of ['stops', 'objectives', 'chapters', 'crew']) await admin.from(t).delete().eq('tenant_id', tid); await admin.from('tenants').delete().eq('id', tid); }
  for (const uid of made) await admin.auth.admin.deleteUser(uid);
  console.log('🧹 torn down');
}
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
