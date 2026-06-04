-- Gear inventory: what's in the rig + its status. Shotgun reads this to answer
-- "did I pack the #4?" and nag about repairs/replacements/loans. Publicly
-- readable (gear lists are fun content); writes via owner service role.
create table if not exists gear (
  id text primary key,
  name text not null,
  category text,
  emoji text,
  status text not null default 'packed' check (status in ('packed','repair','replace','loaned','missing')),
  qty int,
  note text,
  loaned_to text,
  objectives text[]
);

alter table gear enable row level security;
create policy "read gear" on gear for select using (true);
-- No public write policy — gear is managed by the owner (service role / CMS).
