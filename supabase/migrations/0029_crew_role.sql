-- Applied live via Supabase MCP 2026-06-10 (repo file lags the live DB by convention).
--
-- Membership tiers for the join pipeline + self-declare panel:
--   owner     → full CMS (approve join requests, edit everything) — existing crew
--   driver    → own rig + route, self-declare, and can admit join requests
--   passenger → rides legs, self-declares own participation only
-- is_owner stays the legacy full-CMS gate (existing endpoints rely on it); role adds the
-- finer driver/passenger tiers. See src/lib/auth.ts (currentCrew / isOwner / canApprove / isCrew).
alter table crew add column if not exists role text not null default 'passenger'
  check (role in ('owner', 'driver', 'passenger'));
update crew set role = 'owner' where is_owner;
