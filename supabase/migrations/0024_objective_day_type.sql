-- Applied live via Supabase MCP 2026-06-07 (repo file lags the live DB by convention;
-- Shotgun applies migrations through the MCP). Kept here for traceability.
--
-- crag = WFH-friendly cragging near town/cell; alpine = weekend committing alpine mission.
-- Drives the Plan/objectives filter + badge for David's weekday-work / weekend-send rhythm.
alter table objectives add column if not exists day_type text check (day_type in ('crag','alpine'));
comment on column objectives.day_type is 'crag = WFH-friendly cragging near town/cell; alpine = weekend committing alpine objective';
