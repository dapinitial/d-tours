-- Per-trip notification settings: owner controls WHICH emails go out and WHEN.
-- Additive + backward-compatible. Defaults preserve today's behavior (all on) but
-- move the daily digest to 4:00 in the trip's timezone instead of a fixed UTC hour.
--
-- The digest is dispatched by an hourly pg_cron tick (see 0039 companion reschedule
-- + /api/digest): each hour the endpoint sends to trips whose local time == digest_hour
-- and that haven't gone out yet today (last_digest_on guards against double-sends).
alter table tenants
  add column if not exists digest_enabled            boolean not null default true,
  add column if not exists digest_hour               smallint not null default 4
    check (digest_hour between 0 and 23),
  add column if not exists digest_tz                 text not null default 'America/Chicago',
  add column if not exists last_digest_on            date,
  add column if not exists sendwindow_alerts_enabled boolean not null default true,
  add column if not exists proximity_alerts_enabled  boolean not null default true;

-- David's trip: 4:00 Central, all notifications on (explicit = matches the 0037 pattern).
update tenants set
  digest_enabled = true, digest_hour = 4, digest_tz = 'America/Chicago',
  sendwindow_alerts_enabled = true, proximity_alerts_enabled = true
where slug = 'david';

-- Rollback: alter table tenants
--   drop column digest_enabled, drop column digest_hour, drop column digest_tz,
--   drop column last_digest_on, drop column sendwindow_alerts_enabled,
--   drop column proximity_alerts_enabled;
