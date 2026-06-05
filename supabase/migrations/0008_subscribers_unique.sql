-- /api/subscribe upserts on (tenant_id, email) but no matching unique constraint
-- existed, so every subscribe errored ("no unique or exclusion constraint matching
-- the ON CONFLICT specification"). Add it.
alter table subscribers add constraint subscribers_tenant_email_key unique (tenant_id, email);
