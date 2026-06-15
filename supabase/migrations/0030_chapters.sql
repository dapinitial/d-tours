-- Applied live via Supabase MCP 2026-06-14 (repo file lags the live DB by convention;
-- Shotgun applies migrations through the MCP). Kept here for traceability.
--
-- Trip CHAPTERS + the day/commit dimensions on stops. The trip becomes a spine of
-- named, dated chapters ("The Winds", "The Wedding"); the calendar + map group by them.
-- "Committing" an option pulls it from the pool onto a specific day — a stop that now
-- carries a real date, a chapter, an optional objective back-link, and a day_type.
-- See docs/superpowers/specs/2026-06-14-trip-chapters-calendar-design.md.

-- Named, dated chapters. Public-read like stops/objectives; writes go through the
-- service-role API. Scoped per tenant.
create table if not exists chapters (
  id text primary key,
  tenant_id uuid references tenants(id),
  name text not null,
  emoji text,
  blurb text,
  start_date date,
  end_date date,                       -- null = open-ended (the "Onward" back half)
  sort integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists chapters_tenant_idx on chapters(tenant_id);
alter table chapters enable row level security;
drop policy if exists "read chapters" on chapters;
create policy "read chapters" on chapters for select using (true);
comment on table chapters is 'Named, dated trip chapters (e.g. "The Winds"). The spine the calendar + map group by.';

-- Stops gain the day-level dimensions. Existing free-text stops.date is kept as a
-- display label; start_date/end_date are the structured truth the calendar + map use.
alter table stops add column if not exists start_date date;
alter table stops add column if not exists end_date   date;
alter table stops add column if not exists chapter_id   text references chapters(id)   on delete set null;
alter table stops add column if not exists objective_id text references objectives(id) on delete set null;
alter table stops add column if not exists day_type     text check (day_type in ('remote-work','recovery','travel','crag','alpine'));
create index if not exists stops_chapter_idx   on stops(chapter_id);
create index if not exists stops_objective_idx on stops(objective_id);
comment on column stops.day_type     is 'character of the day: remote-work | recovery | travel | crag | alpine';
comment on column stops.objective_id is 'set when this stop was committed from a climb — deep-links the dossier, carries beta';
comment on column stops.start_date   is 'structured ISO date; free-text stops.date kept as display label';

-- Seed for tenant 76ef81a5-… (David's Mega-Loop). Idempotent.
insert into chapters (id, tenant_id, name, emoji, blurb, start_date, end_date, sort) values
('dch-kickoff','76ef81a5-2ec8-4854-a4c7-91db449a404b','Kickoff','🚐','Launch + shake-out the rig.','2026-07-04','2026-07-07',1),
('dch-winds','76ef81a5-2ec8-4854-a4c7-91db449a404b','The Winds','🏔️','With Ryan — Cirque of the Towers Traverse, Pingora, East Ridge of Wolf''s Head.','2026-07-08','2026-07-15',2),
('dch-03','76ef81a5-2ec8-4854-a4c7-91db449a404b','Jul 15–18 (untitled)','📍','Open stretch — pull options from the pool as conditions firm up.','2026-07-15','2026-07-18',3),
('dch-04','76ef81a5-2ec8-4854-a4c7-91db449a404b','Jul 18–20 (untitled)','📍','Open stretch — commit as plans firm up.','2026-07-18','2026-07-20',4),
('dch-05','76ef81a5-2ec8-4854-a4c7-91db449a404b','Jul 20–22 (untitled)','📍','Open stretch — commit as plans firm up.','2026-07-20','2026-07-22',5),
('dch-06','76ef81a5-2ec8-4854-a4c7-91db449a404b','Jul 23–25 (untitled)','📍','Open stretch — commit as plans firm up.','2026-07-23','2026-07-25',6),
('dch-07','76ef81a5-2ec8-4854-a4c7-91db449a404b','Jul 26–28 (untitled)','📍','Open stretch toward Spokane.','2026-07-26','2026-07-28',7),
('dch-spokane','76ef81a5-2ec8-4854-a4c7-91db449a404b','Spokane','🏙️','Arrive Spokane — resupply, family, pre-wedding.','2026-07-29','2026-07-31',8),
('dch-wedding','76ef81a5-2ec8-4854-a4c7-91db449a404b','The Wedding','💍','Spokane wedding — the pivot of the whole trip.','2026-08-01','2026-08-03',9),
('dch-onward','76ef81a5-2ec8-4854-a4c7-91db449a404b','Onward','🧭','The back half — Sawtooth, Cascades, Squamish. Dates open.','2026-08-04',null,10)
on conflict (id) do nothing;
