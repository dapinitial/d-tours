-- Give stops coordinates so a live GPS fix can be located *within the journey*
-- ("you're on the Austin→Hill Country leg, next up Reimers") and so the look-ahead
-- can scan the corridor toward the next stops. Coordinates for the David trip are
-- seeded directly (see seed data / one-off update), not in this schema migration.
alter table stops add column if not exists lat double precision;
alter table stops add column if not exists lng double precision;
