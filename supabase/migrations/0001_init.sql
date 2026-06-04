-- ════════════════════════════════════════════════════════════════════════
-- D-Tours schema. Run in Supabase SQL editor (or `supabase db push`).
-- Social model: likes are OPEN; comments are GATED to the crew (magic-link auth)
-- and owner-moderated. See SPEC §10.
-- ════════════════════════════════════════════════════════════════════════

-- ── Itinerary ──
create table if not exists stops (
  id text primary key,
  "order" int not null,
  name text not null,
  sub text,
  emoji text,
  date text,
  flex text not null default 'soft' check (flex in ('hard','soft','open')),
  region text,
  rendezvous text
);

create table if not exists objectives (
  id text primary key,
  name text not null,
  region text,
  commitment text,
  grade text,
  hazard text,
  severity text default 'med' check (severity in ('low','med','high')),
  discipline text
);

create table if not exists resources (
  id text primary key,
  layer text not null,           -- climb | life | move | weird | logistics
  title text not null,
  emoji text,
  body text,
  region text
);

-- ── Journal ──
create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  created_at timestamptz not null default now(),
  published_at timestamptz,      -- null = queued (Tier 1)
  lat double precision,
  lng double precision,
  media text[] not null default '{}',
  author text default 'David',
  like_count int not null default 0,
  tier int default 2
);

create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references posts(id) on delete cascade,
  author text not null,
  body text not null,
  created_at timestamptz not null default now(),
  approved boolean not null default false   -- owner moderates
);

-- crew allowlist for gated comments (emails invited via magic link)
create table if not exists crew (
  email text primary key,
  display_name text,
  is_owner boolean default false,
  added_at timestamptz default now()
);

-- atomic like increment (called by /api/like)
create or replace function increment_like(p_post_id uuid)
returns void language sql as $$
  update posts set like_count = like_count + 1 where id = p_post_id;
$$;

-- ════════ Row Level Security ════════
alter table posts enable row level security;
alter table comments enable row level security;
alter table stops enable row level security;
alter table objectives enable row level security;
alter table resources enable row level security;

-- Public can READ published content; itinerary/objectives/resources fully public.
create policy "read published posts" on posts for select using (published_at is not null);
create policy "read stops"      on stops      for select using (true);
create policy "read objectives" on objectives for select using (true);
create policy "read resources"  on resources  for select using (true);

-- Comments: anyone reads APPROVED ones; only authed CREW can insert.
create policy "read approved comments" on comments for select using (approved = true);
create policy "crew can comment" on comments for insert to authenticated
  with check (exists (select 1 from crew c where c.email = auth.jwt() ->> 'email'));

-- Writes to posts (publish/queue/edit) + moderation happen via the service-role
-- key (server / home-iMac agent), which bypasses RLS. No client write policy by design.
