-- Applied live via Supabase MCP 2026-06-07 (repo file lags the live DB by convention).
--
-- gpx_verified = false: a track Shotgun auto-found (provisional — "verify in Gaia");
-- true: David uploaded/confirmed his own track via /cms/objectives. Drives a ⚠ badge
-- on the dossier until the owner confirms it.
alter table objectives add column if not exists gpx_verified boolean not null default false;
comment on column objectives.gpx_verified is 'false = auto-found provisional GPX (verify in Gaia); true = owner-uploaded/confirmed';
