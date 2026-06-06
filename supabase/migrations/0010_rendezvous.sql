-- Rendezvous: a confirmable meet-up. Friends/partners propose ("I'm in Denver
-- Aug 5 — catch you?"); the owner confirms a place + time. Confirmed ones show
-- publicly; proposed ones are owner-only (moderated via service role).
create table if not exists rendezvous (
  id text primary key,
  tenant_id uuid references tenants(id),
  name text not null,
  place text,
  lat double precision,
  lng double precision,
  when_text text,
  status text not null default 'proposed' check (status in ('proposed','confirmed','declined')),
  proposed_by text,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists rendezvous_tenant_idx on rendezvous(tenant_id);
alter table rendezvous enable row level security;
create policy "read confirmed rendezvous" on rendezvous for select using (status = 'confirmed');
