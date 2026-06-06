-- The RIG: one rich row per tenant. Part build-page spotlight (video, photos,
-- capabilities, how we live), part maintenance log (oil/intervals/filters/bulbs/
-- tires/tools/service history). Public read; owner edits via /api/rig (service role).
create table if not exists rig (
  tenant_id uuid primary key references tenants(id) on delete cascade,
  name text,
  tagline text,
  video_url text,
  living text,                 -- how we live & travel
  photos jsonb,                -- [{url, caption}]
  capabilities jsonb,          -- [string]
  build jsonb,                 -- {Engine: "...", Suspension: "...", Winch: "..."}
  maintenance jsonb,           -- {"Oil type": "...", "Oil interval": "...", "Air filter": "..."}
  bulbs jsonb,                 -- [{location, part}]
  tools jsonb,                 -- [string]
  service_log jsonb,           -- [{date, what}]
  updated_at timestamptz default now()
);
alter table rig enable row level security;
drop policy if exists "rig public read" on rig;
create policy "rig public read" on rig for select using (true);
