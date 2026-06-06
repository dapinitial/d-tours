-- Each objective becomes a living dossier. `beta` (jsonb) holds the structured
-- field guide Shotgun compiles from the pinned `sources` (links the owner seeds):
-- routes[], rack/ropes/footwear, skills, camp, water, permits, hazards,
-- conditions (weather/avalanche/bugs), nearby objectives, etc. `gpx_url` is the
-- track. Owner-editable; Shotgun fills/refreshes it.
alter table objectives add column if not exists beta jsonb;
alter table objectives add column if not exists gpx_url text;
