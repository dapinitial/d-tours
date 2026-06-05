-- Living soundtrack on top of playlist_suggestions: friends suggest (pending →
-- approved), the owner "spins" a track (played_at + where), and the played rows
-- newest-first become "the soundtrack so far." Now-playing = latest played_at.
alter table playlist_suggestions add column if not exists played_at timestamptz;
alter table playlist_suggestions add column if not exists lat double precision;
alter table playlist_suggestions add column if not exists lng double precision;
alter table playlist_suggestions add column if not exists region text;
create index if not exists playlist_played_idx on playlist_suggestions(played_at desc);
