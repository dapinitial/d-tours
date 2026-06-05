-- Supabase advisor cleanup.
-- 0008 added a (tenant_id,email) unique that already existed → duplicate index.
alter table subscribers drop constraint if exists subscribers_tenant_email_key;

-- Covering indexes for foreign keys we filter/join on (perf advisor).
create index if not exists comments_post_idx on comments(post_id);
create index if not exists comments_tenant_idx on comments(tenant_id);
create index if not exists playlist_tenant_idx on playlist_suggestions(tenant_id);
create index if not exists sources_stop_idx on sources(stop_id);
create index if not exists sources_objective_idx on sources(objective_id);

-- NOTE (intentional, not fixed here):
--  • subscribers / suggestions have RLS enabled with NO policy — that's the
--    SECURE state: written via service role, never read by the anon client
--    (owner moderation reads them via service role). Leave as-is.
--  • crew "read own crew" RLS re-evaluates auth.<fn>() per row — negligible on a
--    tiny table; not rewritten to avoid risk to the working owner-auth gate.
--  • Auth leaked-password protection is off — N/A (magic-link/OTP, no passwords).
