-- Applied live via Supabase MCP 2026-06-09 (repo file lags the live DB by convention).
--
-- Caravan sign-ups: per-objective, two DISTINCT roles —
--   'climb' = JOIN CLIMB (roped up on the objective with the team)
--   'ride'  = RIDE ALONG (holds down the rig: guards the car + Starlink, runs the
--             solar to harvest power, welcome party when the team tops out)
-- Public signs up (status 'pending'); the owner vets + confirms (it's their rig the
-- ride-alongs guard). Confirmed sign-ups show on the dossier roster. Mirrors `rendezvous`.
create table if not exists signups (
  id text primary key,
  tenant_id uuid references tenants(id),
  objective_id text references objectives(id) on delete cascade,
  name text not null,
  contact text,
  role text not null default 'climb' check (role in ('climb','ride')),
  note text,
  status text not null default 'pending' check (status in ('pending','confirmed','declined')),
  created_at timestamptz not null default now()
);
create index if not exists signups_objective_idx on signups(objective_id);
create index if not exists signups_tenant_idx on signups(tenant_id);
alter table signups enable row level security;
create policy "read confirmed signups" on signups for select using (status = 'confirmed');
