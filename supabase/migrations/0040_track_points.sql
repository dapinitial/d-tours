-- Real GPS breadcrumb: the actual path travelled, accumulated from the inReach feed
-- (the /api/watch cron harvests new points every ~30 min and appends here). The live
-- map draws this as the "where we've actually been" line — distinct from the planned
-- stop-to-stop route. unique(tenant_id, at) makes re-harvesting the same point a no-op.
create table if not exists track_points (
  id        bigint generated always as identity primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  at        timestamptz not null,      -- point time from the feed's <when>
  lat       double precision not null,
  lng       double precision not null,
  ele       double precision,
  unique (tenant_id, at)
);
create index if not exists track_points_tenant_at_idx on track_points (tenant_id, at);

alter table track_points enable row level security;
-- Read: members + anyone for a public trip (the map is public). Mirrors the stops policy.
drop policy if exists "track_points read" on track_points;
create policy "track_points read" on track_points for select
  using (tenant_id in (select current_tenant_ids()) or tenant_id in (select id from tenants where visibility='public'));
-- Write: writable members only (harvest runs as service-role, which bypasses RLS anyway).
drop policy if exists "track_points write" on track_points;
create policy "track_points write" on track_points for all
  using (tenant_id in (select current_writable_tenant_ids()))
  with check (tenant_id in (select current_writable_tenant_ids()));

-- Trip start: the map floors both the breadcrumb and the live dot at this date, so
-- points from before the trip (old inReach sessions) never show. NULL = no floor.
alter table tenants add column if not exists trip_start date;
update tenants set trip_start = '2026-07-15' where slug = 'david';

-- Rollback: drop table track_points; alter table tenants drop column trip_start;
