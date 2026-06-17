-- Slice 1: per-trip settings. Additive + backward-compatible (no component reads these
-- until later slices). New trips default to 'approximate' location sharing.
-- Spec: docs/superpowers/specs/2026-06-17-trip-settings-design.md
alter table tenants
  add column if not exists mapshare_feed_url text,
  add column if not exists location_sharing  text not null default 'approximate'
    check (location_sharing in ('precise','approximate','off')),
  add column if not exists contact_email     text,
  add column if not exists contact_phone     text,
  add column if not exists support_links     jsonb not null default '[]'::jsonb;

-- Backfill David's tenant from today's env/hardcoded values so his public site is
-- byte-identical — he becomes the first tenant on per-trip settings instead of env vars.
update tenants set
  mapshare_feed_url = 'https://share.garmin.com/Feed/Share/davidpuerto',
  location_sharing  = 'precise',
  contact_email     = 'me@davidpuerto.com',
  contact_phone     = '12063979040',
  support_links     = '[{"label":"Venmo","url":"https://venmo.com/u/dapinitial"}]'::jsonb
where slug = 'david';

-- Rollback: alter table tenants drop column mapshare_feed_url, drop column location_sharing,
--   drop column contact_email, drop column contact_phone, drop column support_links;
