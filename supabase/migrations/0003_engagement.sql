-- Cheer Squad: subscribers, public detour suggestions, co-pilot playlist picks.
-- Public can INSERT (subscribe / suggest); only the owner (service role) reads
-- the moderation queues. Approved playlist picks are publicly readable.

create table if not exists subscribers (
  email text primary key,
  cadence text not null default 'weekly' check (cadence in ('daily','weekly')),
  created_at timestamptz default now()
);

create table if not exists suggestions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  location text,
  note text,
  suggested_by text default 'a follower',
  status text not null default 'pending' check (status in ('pending','approved','declined')),
  created_at timestamptz default now()
);

create table if not exists playlist_suggestions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  url text,
  kind text not null default 'music' check (kind in ('music','audiobook','podcast')),
  suggested_by text default 'a follower',
  status text not null default 'pending' check (status in ('pending','approved','declined')),
  created_at timestamptz default now()
);

alter table subscribers enable row level security;
alter table suggestions enable row level security;
alter table playlist_suggestions enable row level security;

-- Anyone may subscribe / suggest (public insert). No public SELECT on the queues
-- (owner reads via service role). Approved playlist picks are publicly readable.
create policy "public can subscribe"       on subscribers          for insert with check (true);
create policy "public can suggest detour"  on suggestions          for insert with check (true);
create policy "public can suggest track"   on playlist_suggestions for insert with check (true);
create policy "read approved tracks"       on playlist_suggestions for select using (status = 'approved');
