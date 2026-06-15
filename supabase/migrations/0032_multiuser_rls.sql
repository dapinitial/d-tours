-- Slice 2: private-by-default RLS. Replaces using(true)/status-only reads with
-- member-or-public; adds can_write write policies; explicit anon-insert for the
-- genuine public-submit tables. Reversible (restore using(true) per table).
-- Spec: docs/superpowers/specs/2026-06-15-multiuser-front-door-privacy-design.md
--
-- Helpers (from 0031):
--   (select current_tenant_ids())           => tenants the signed-in user belongs to
--   (select current_writable_tenant_ids())  => of those, the ones where can_write
--   public tenants => (select id from tenants where visibility = 'public')

-- ===== tenants =====
drop policy if exists "read tenants" on tenants;
create policy "tenants read" on tenants for select
  using (visibility = 'public' or id in (select current_tenant_ids()));
create policy "tenants owner update" on tenants for update
  using (id in (select current_writable_tenant_ids()))
  with check (id in (select current_writable_tenant_ids()));

-- ===== crew (membership) =====
drop policy if exists "read own crew" on crew;
create policy "crew read" on crew for select
  using (tenant_id in (select current_tenant_ids()) or email = (auth.jwt() ->> 'email'));
create policy "crew owner write" on crew for all
  using (tenant_id in (select current_writable_tenant_ids()))
  with check (tenant_id in (select current_writable_tenant_ids()));

-- ===== owner-data tables: member-or-public read, writable-member writes =====
-- (chapters, companions, gear, objectives, resources, rig, skills, sources)
drop policy if exists "read chapters" on chapters;
create policy "chapters read" on chapters for select
  using (tenant_id in (select current_tenant_ids()) or tenant_id in (select id from tenants where visibility='public'));
create policy "chapters write" on chapters for all
  using (tenant_id in (select current_writable_tenant_ids()))
  with check (tenant_id in (select current_writable_tenant_ids()));
drop policy if exists "read companions" on companions;
create policy "companions read" on companions for select
  using (tenant_id in (select current_tenant_ids()) or tenant_id in (select id from tenants where visibility='public'));
create policy "companions write" on companions for all
  using (tenant_id in (select current_writable_tenant_ids()))
  with check (tenant_id in (select current_writable_tenant_ids()));
drop policy if exists "read gear" on gear;
create policy "gear read" on gear for select
  using (tenant_id in (select current_tenant_ids()) or tenant_id in (select id from tenants where visibility='public'));
create policy "gear write" on gear for all
  using (tenant_id in (select current_writable_tenant_ids()))
  with check (tenant_id in (select current_writable_tenant_ids()));
drop policy if exists "read objectives" on objectives;
create policy "objectives read" on objectives for select
  using (tenant_id in (select current_tenant_ids()) or tenant_id in (select id from tenants where visibility='public'));
create policy "objectives write" on objectives for all
  using (tenant_id in (select current_writable_tenant_ids()))
  with check (tenant_id in (select current_writable_tenant_ids()));
drop policy if exists "read resources" on resources;
create policy "resources read" on resources for select
  using (tenant_id in (select current_tenant_ids()) or tenant_id in (select id from tenants where visibility='public'));
create policy "resources write" on resources for all
  using (tenant_id in (select current_writable_tenant_ids()))
  with check (tenant_id in (select current_writable_tenant_ids()));
drop policy if exists "read rig" on rig;
create policy "rig read" on rig for select
  using (tenant_id in (select current_tenant_ids()) or tenant_id in (select id from tenants where visibility='public'));
create policy "rig write" on rig for all
  using (tenant_id in (select current_writable_tenant_ids()))
  with check (tenant_id in (select current_writable_tenant_ids()));
drop policy if exists "read skills" on skills;
create policy "skills read" on skills for select
  using (tenant_id in (select current_tenant_ids()) or tenant_id in (select id from tenants where visibility='public'));
create policy "skills write" on skills for all
  using (tenant_id in (select current_writable_tenant_ids()))
  with check (tenant_id in (select current_writable_tenant_ids()));
drop policy if exists "read sources" on sources;
create policy "sources read" on sources for select
  using (tenant_id in (select current_tenant_ids()) or tenant_id in (select id from tenants where visibility='public'));
create policy "sources write" on sources for all
  using (tenant_id in (select current_writable_tenant_ids()))
  with check (tenant_id in (select current_writable_tenant_ids()));
// NOTE: original read policy names dropped above were: 'companions public read','rig public read','skills public read','read gear','read objectives','read resources','read sources','read chapters' — see git history / 0001-0030 for exact names.

-- ===== status-gated public reads (preserve status clause on the public branch) =====
drop policy if exists "read live stops" on stops;
create policy "stops read" on stops for select using (
  tenant_id in (select current_tenant_ids())
  or (tenant_id in (select id from tenants where visibility='public') and status is distinct from 'declined'));
create policy "stops write" on stops for all
  using (tenant_id in (select current_writable_tenant_ids())) with check (tenant_id in (select current_writable_tenant_ids()));

drop policy if exists "read published posts" on posts;
create policy "posts read" on posts for select using (
  tenant_id in (select current_tenant_ids())
  or (tenant_id in (select id from tenants where visibility='public') and published_at is not null));
create policy "posts write" on posts for all
  using (tenant_id in (select current_writable_tenant_ids())) with check (tenant_id in (select current_writable_tenant_ids()));

drop policy if exists "read confirmed rendezvous" on rendezvous;
create policy "rendezvous read" on rendezvous for select using (
  tenant_id in (select current_tenant_ids())
  or (tenant_id in (select id from tenants where visibility='public') and status = 'confirmed'));
create policy "rendezvous write" on rendezvous for all
  using (tenant_id in (select current_writable_tenant_ids())) with check (tenant_id in (select current_writable_tenant_ids()));

-- ===== public-submit tables: anon insert + member-or-public(status) read + owner moderate =====
drop policy if exists "read approved comments" on comments;
create policy "comments read" on comments for select using (
  tenant_id in (select current_tenant_ids())
  or (tenant_id in (select id from tenants where visibility='public') and approved = true));
create policy "comments public insert" on comments for insert with check (true);
create policy "comments owner moderate" on comments for update
  using (tenant_id in (select current_writable_tenant_ids())) with check (tenant_id in (select current_writable_tenant_ids()));
create policy "comments owner delete" on comments for delete using (tenant_id in (select current_writable_tenant_ids()));

drop policy if exists "read confirmed signups" on signups;
create policy "signups read" on signups for select using (
  tenant_id in (select current_tenant_ids())
  or (tenant_id in (select id from tenants where visibility='public') and status = 'confirmed'));
create policy "signups public insert" on signups for insert with check (true);
create policy "signups owner moderate" on signups for update
  using (tenant_id in (select current_writable_tenant_ids())) with check (tenant_id in (select current_writable_tenant_ids()));
create policy "signups owner delete" on signups for delete using (tenant_id in (select current_writable_tenant_ids()));

drop policy if exists "read approved tracks" on playlist_suggestions;
create policy "playlist read" on playlist_suggestions for select using (
  tenant_id in (select current_tenant_ids())
  or (tenant_id in (select id from tenants where visibility='public') and status = 'approved'));
create policy "playlist public insert" on playlist_suggestions for insert with check (true);
create policy "playlist owner moderate" on playlist_suggestions for update
  using (tenant_id in (select current_writable_tenant_ids())) with check (tenant_id in (select current_writable_tenant_ids()));
create policy "playlist owner delete" on playlist_suggestions for delete using (tenant_id in (select current_writable_tenant_ids()));

create policy "subscribers read" on subscribers for select using (tenant_id in (select current_tenant_ids()));
create policy "subscribers public insert" on subscribers for insert with check (true);
create policy "subscribers owner manage" on subscribers for all
  using (tenant_id in (select current_writable_tenant_ids())) with check (tenant_id in (select current_writable_tenant_ids()));

create policy "suggestions read" on suggestions for select using (tenant_id in (select current_tenant_ids()));
create policy "suggestions public insert" on suggestions for insert with check (true);
create policy "suggestions owner manage" on suggestions for all
  using (tenant_id in (select current_writable_tenant_ids())) with check (tenant_id in (select current_writable_tenant_ids()));

-- proximity_log: owner-only read; writes stay service-role (cron).
create policy "proximity read" on proximity_log for select using (tenant_id in (select current_tenant_ids()));

-- Rollback: drop the new policies and restore `using(true)` reads per table.
