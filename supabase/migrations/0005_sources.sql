-- ── Sources / Beta library ──
-- A pool of links the owner feeds in for "our Claude" to read and distill.
-- Each row is a seed: a URL + a note (what to pull), optionally pinned to a
-- stop or objective. The home-iMac Claude reads status='new' rows, fetches the
-- page, and writes the distilled `beta` back, flipping status to 'enriched'.
create table if not exists sources (
  id text primary key,
  tenant_id uuid references tenants(id),
  url text not null,
  title text,
  note text,                       -- owner instruction, e.g. "pull current conditions"
  tag text default 'general',      -- wikipedia | mountain-project | wta | forecast | general …
  stop_id text references stops(id) on delete set null,
  objective_id text references objectives(id) on delete set null,
  status text not null default 'new' check (status in ('new','enriched','error')),
  beta text,                       -- distilled markdown the agent writes back
  beta_updated_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists sources_tenant_idx on sources(tenant_id);
create index if not exists sources_status_idx on sources(status);

-- RLS: mirror stops/resources — public read, writes via service role only.
alter table sources enable row level security;
create policy "read sources" on sources for select using (true);
-- No client write policy by design; the owner writes via the service-role API,
-- and the home-iMac Claude enriches via the service-role / MCP connection.
