// Verifies link_my_crew() claims a pre-existing crew row (auth_user_id null) for the
// signed-in user — the path that keeps David's co-owners (Ryan/Derek) from being
// locked out by RLS after they first sign in.
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
process.loadEnvFile('.env');
const url = process.env.PUBLIC_SUPABASE_URL, anonKey = process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY, secret = process.env.SUPABASE_SECRET_KEY;
const admin = createClient(url, secret, { auth: { persistSession: false } });
const results = [];
const check = (n, p, d = '') => { results.push(p); console.log(`${p ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`); };

const TAG = 'link-' + randomUUID().slice(0, 8);
const email = `${TAG}@audit.local`, password = 'Aud!t-' + randomUUID();
let userId, tid;
try {
  // a pre-existing tenant + crew row with NO auth link (like Ryan/Derek today)
  const { data: t } = await admin.from('tenants').insert({ slug: TAG, name: TAG, visibility: 'private' }).select('id').single();
  tid = t.id;
  await admin.from('crew').insert({ email, tenant_id: tid, is_owner: true, can_write: true, role: 'owner', auth_user_id: null });
  await admin.from('objectives').insert({ id: randomUUID(), name: `${TAG} obj`, tenant_id: tid });

  const { data: u } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  userId = u.user.id;
  const signer = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: s } = await signer.auth.signInWithPassword({ email, password });
  const uc = createClient(url, anonKey, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${s.session.access_token}` } } });

  // before linking: RLS can't see the private trip (auth_user_id not yet set)
  const before = (await uc.from('objectives').select('id').eq('tenant_id', tid)).data?.length ?? 0;
  check('before link: owner cannot yet read own private trip', before === 0);

  const { error: linkErr } = await uc.rpc('link_my_crew');
  check('link_my_crew runs', !linkErr, linkErr?.message ?? '');

  const { data: crew } = await admin.from('crew').select('auth_user_id').eq('email', email).single();
  check('crew row now linked to auth user', crew.auth_user_id === userId);

  const after = (await uc.from('objectives').select('id').eq('tenant_id', tid)).data?.length ?? 0;
  check('after link: owner can read own private trip', after === 1);
} catch (e) {
  check('run', false, e.message);
} finally {
  if (tid) { for (const t of ['objectives', 'crew']) await admin.from(t).delete().eq('tenant_id', tid); await admin.from('tenants').delete().eq('id', tid); }
  if (userId) await admin.auth.admin.deleteUser(userId);
  console.log('🧹 torn down');
}
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
