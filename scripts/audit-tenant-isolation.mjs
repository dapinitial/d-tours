// Cross-tenant isolation audit (slice 4). Proves the private-by-default RLS (0032).
// Provisions two throwaway users + private tenants, exercises RLS as each user and as
// anon, then tears everything down. Run: node scripts/audit-tenant-isolation.mjs
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

process.loadEnvFile('.env');
const url = process.env.PUBLIC_SUPABASE_URL;
const anonKey = process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !anonKey || !secret) { console.error('Missing env (URL / publishable / secret).'); process.exit(2); }

const admin = createClient(url, secret, { auth: { persistSession: false } });
const anon = createClient(url, anonKey, { auth: { persistSession: false } });
const userClient = (token) =>
  createClient(url, anonKey, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } });

const results = [];
const check = (name, pass, detail = '') => { results.push({ name, pass, detail }); console.log(`${pass ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };
const count = async (client, table, tenantId) => {
  const { data, error } = await client.from(table).select('id').eq('tenant_id', tenantId);
  if (error) return { n: 0, error: error.message };
  return { n: data.length };
};

const TAG = 'audit-' + randomUUID().slice(0, 8);
const made = { users: [], tenants: [], suggestions: [] };

async function seedTenant(label, userId, email) {
  const slug = `${TAG}-${label}`;
  const { data: t, error: te } = await admin.from('tenants')
    .insert({ slug, name: `${TAG} ${label}`, visibility: 'private' }).select('id').single();
  if (te) throw new Error(`seed tenant ${label}: ${te.message}`);
  const tid = t.id; made.tenants.push(tid);
  await admin.from('crew').insert({ email, tenant_id: tid, is_owner: true, can_write: true, auth_user_id: userId, role: 'owner', display_name: label });
  await admin.from('objectives').insert({ id: randomUUID(), name: `${TAG} obj ${label}`, tenant_id: tid });
  await admin.from('stops').insert({ id: randomUUID(), order: 1, name: `${TAG} stop ${label}`, tenant_id: tid });
  await admin.from('gear').insert({ id: randomUUID(), name: `${TAG} gear ${label}`, tenant_id: tid });
  return tid;
}

async function main() {
  // public tenant for the public-read tests
  const { data: pub } = await admin.from('tenants').select('id').eq('slug', 'david').single();
  const publicTid = pub.id;

  // two throwaway users
  const mkUser = async (label) => {
    const email = `${TAG}-${label}@audit.local`; const password = 'Aud!t-' + randomUUID();
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(`createUser ${label}: ${error.message}`);
    made.users.push(data.user.id);
    return { id: data.user.id, email, password };
  };
  const A = await mkUser('A'); const B = await mkUser('B');
  const TA = await seedTenant('A', A.id, A.email);
  const TB = await seedTenant('B', B.id, B.email);

  // sign in to get JWTs — use a throwaway client so the shared `anon` client stays
  // a pristine anonymous session (reusing it would silently authenticate `anon` as A).
  const tok = async (u) => {
    const signer = createClient(url, anonKey, { auth: { persistSession: false } });
    const { data, error } = await signer.auth.signInWithPassword({ email: u.email, password: u.password });
    if (error) throw new Error(`signIn ${u.email}: ${error.message} (is the password provider enabled?)`);
    return data.session.access_token;
  };
  const cA = userClient(await tok(A));

  // ── READ isolation ──
  check('A reads own tenant objectives', (await count(cA, 'objectives', TA)).n >= 1);
  check("A CANNOT read other tenant objectives", (await count(cA, 'objectives', TB)).n === 0);
  check("A CANNOT read other tenant stops", (await count(cA, 'stops', TB)).n === 0);
  check("A CANNOT read other tenant gear", (await count(cA, 'gear', TB)).n === 0);
  check('A reads PUBLIC tenant objectives', (await count(cA, 'objectives', publicTid)).n >= 1);
  check('anon CANNOT read private tenant A', (await count(anon, 'objectives', TA)).n === 0);
  check('anon CANNOT read private tenant B', (await count(anon, 'objectives', TB)).n === 0);
  check('anon reads PUBLIC tenant objectives', (await count(anon, 'objectives', publicTid)).n >= 1);

  // ── WRITE isolation ──
  const insBad = await cA.from('objectives').insert({ id: randomUUID(), name: `${TAG} cross`, tenant_id: TB }).select('id');
  check('A CANNOT insert into other tenant', !!insBad.error || (insBad.data ?? []).length === 0, insBad.error?.message ?? '');
  const insGood = await cA.from('objectives').insert({ id: randomUUID(), name: `${TAG} own`, tenant_id: TA }).select('id');
  check('A CAN insert into own tenant', !insGood.error && (insGood.data ?? []).length === 1, insGood.error?.message ?? '');
  const { data: tbObj } = await admin.from('objectives').select('id').eq('tenant_id', TB).limit(1).single();
  const upd = await cA.from('objectives').update({ name: `${TAG} hijack` }).eq('id', tbObj.id).select('id');
  check("A CANNOT update other tenant's row", !upd.error && (upd.data ?? []).length === 0, upd.error?.message ?? '');
  const del = await cA.from('objectives').delete().eq('id', tbObj.id).select('id');
  check("A CANNOT delete other tenant's row", !del.error && (del.data ?? []).length === 0, del.error?.message ?? '');

  // ── public-submit + owner-only ──
  // Insert with return=minimal: the anon SELECT policy correctly hides a pending
  // suggestion, so requesting it back would surface as a (misleading) insert error.
  // The app never reads it back on submit, so minimal is the faithful test.
  const sug = await anon.from('suggestions').insert({ title: `${TAG} detour`, tenant_id: publicTid });
  check('anon CAN submit a suggestion (public insert)', !sug.error, sug.error?.message ?? '');
  check('anon CANNOT read subscribers (owner-only)', (await count(anon, 'subscribers', publicTid)).n === 0);
}

async function teardown() {
  for (const t of ['objectives', 'stops', 'gear']) await admin.from(t).delete().in('tenant_id', made.tenants);
  await admin.from('crew').delete().in('tenant_id', made.tenants);
  await admin.from('suggestions').delete().like('title', `${TAG}%`);
  await admin.from('tenants').delete().in('id', made.tenants);
  for (const uid of made.users) await admin.auth.admin.deleteUser(uid);
}

try {
  await main();
} catch (e) {
  check('audit run', false, e.message);
} finally {
  try { await teardown(); console.log('🧹 torn down'); } catch (e) { console.error('teardown error:', e.message); }
}
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
