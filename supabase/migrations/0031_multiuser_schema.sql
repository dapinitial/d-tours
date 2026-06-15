-- Slice 1: schema core for the multi-user pivot. Additive + reversible. RLS untouched.
-- Spec: docs/superpowers/specs/2026-06-15-multiuser-front-door-privacy-design.md

-- tenants: visibility (private by default), declared intent, dossier schema, template flag
alter table tenants add column if not exists visibility text not null default 'private'
  check (visibility in ('private','public'));
alter table tenants add column if not exists intent_text text;
alter table tenants add column if not exists section_schema jsonb;
alter table tenants add column if not exists is_template boolean not null default false;

-- crew: real auth linkage + write capability. PK left as-is (one-user-one-trip for the
-- beta); re-keying to support multi-trip-per-user is a deferred future migration.
alter table crew add column if not exists auth_user_id uuid references auth.users(id);
alter table crew add column if not exists can_write boolean not null default true;

-- membership lookups used by every RLS policy. SECURITY DEFINER so the policy's own
-- SELECT on crew does not recurse through crew's RLS.
create or replace function current_tenant_ids() returns setof uuid
  language sql stable security definer set search_path = public as $$
    select tenant_id from crew where auth_user_id = auth.uid();
$$;

create or replace function current_writable_tenant_ids() returns setof uuid
  language sql stable security definer set search_path = public as $$
    select tenant_id from crew where auth_user_id = auth.uid() and can_write;
$$;

-- backfill auth linkage for existing crew where an auth user already exists (David)
update crew c set auth_user_id = u.id
  from auth.users u where u.email = c.email and c.auth_user_id is null;

-- flagship trips are the public showcase; everything new defaults private.
-- Inert until the RLS rewrite (0032) actually consults visibility.
update tenants set visibility = 'public' where is_default = true or slug = 'derek';

-- Rollback: alter table tenants drop column visibility, drop column intent_text,
--   drop column section_schema, drop column is_template;
--   alter table crew drop column auth_user_id, drop column can_write;
--   drop function current_tenant_ids; drop function current_writable_tenant_ids;
