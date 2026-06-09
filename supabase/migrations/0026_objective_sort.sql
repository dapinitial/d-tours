-- Applied live via Supabase MCP 2026-06-08 (repo file lags the live DB by convention).
--
-- Manual trip-sequence ordering for objectives (like stops.order). Double precision
-- so a fractional value can slot between two without renumbering everything. Drag-set
-- in /cms/objectives → "Reorder route"; getObjectives() orders by it (nulls last).
alter table objectives add column if not exists sort double precision;
