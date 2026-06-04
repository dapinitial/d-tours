-- On-the-fly itinerary mutation: D-Tours stages proposed/suggested stops that
-- David confirms via Messenger. Adds lifecycle + side-quest metadata to stops.
alter table stops add column if not exists status text default 'confirmed'
  check (status in ('confirmed','proposed','suggested','declined'));
alter table stops add column if not exists kind text default 'stop'
  check (kind in ('stop','sidequest','pitstop'));
alter table stops add column if not exists source text default 'david';
alter table stops add column if not exists note text;
alter table stops add column if not exists off_route_mi double precision;
alter table stops add column if not exists time_cost_min int;

-- Public should only see live itinerary, not declined items.
drop policy if exists "read stops" on stops;
create policy "read live stops" on stops for select using (status is distinct from 'declined');
