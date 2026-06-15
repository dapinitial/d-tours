-- Slice 5b: atomic signup→trip. SECURITY DEFINER so it can create the tenant + owner
-- crew row + clone the template regardless of RLS, but it only ever creates a trip
-- owned by the caller (auth.uid()). Idempotent: an existing owner gets their trip back.
-- Table refs in the clone are qualified because the RETURNS TABLE(tenant_id,...) names
-- would otherwise be ambiguous against each table's tenant_id column.
create or replace function provision_trip(p_intent text, p_name text)
returns table(tenant_id uuid, slug text)
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  uemail text := auth.jwt() ->> 'email';
  existing uuid;
  new_tid uuid;
  new_slug text;
  suffix text;
  tmpl uuid;
  base_schema jsonb := '{"sections":[
    {"key":"plan","label":"Day Plan","icon":"📍","fields":["plan","timing"]},
    {"key":"packing","label":"Packing List","icon":"🎒","fields":["essentials","layers","docs"]},
    {"key":"eats","label":"Eats & Fuel","icon":"🍔","fields":["food","coffee","gas"]},
    {"key":"stay","label":"Where to Sleep","icon":"🛏️","fields":["sleep","resupply"]},
    {"key":"notes","label":"Notes","icon":"📝","fields":["misc"]}
  ]}'::jsonb;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  select c.tenant_id into existing from crew c where c.auth_user_id = uid and c.is_owner limit 1;
  if existing is not null then
    return query select t.id, t.slug from tenants t where t.id = existing;
    return;
  end if;

  new_tid := gen_random_uuid();
  suffix := left(replace(new_tid::text, '-', ''), 8);
  new_slug := trim(both '-' from regexp_replace(lower(coalesce(nullif(trim(p_name), ''), 'trip')), '[^a-z0-9]+', '-', 'g'));
  if new_slug = '' then new_slug := 'trip'; end if;
  new_slug := new_slug || '-' || left(suffix, 4);

  insert into tenants (id, slug, name, visibility, intent_text, section_schema, is_template, owner_email, owner_id, created_at)
  values (new_tid, new_slug, coalesce(nullif(trim(p_name), ''), 'My Trip'), 'private', p_intent, base_schema, false, uemail, uid, now());

  insert into crew (email, tenant_id, display_name, is_owner, can_write, role, auth_user_id)
  values (uemail, new_tid, split_part(coalesce(uemail, 'traveler'), '@', 1), true, true, 'owner', uid);

  select t.id into tmpl from tenants t where t.is_template order by t.created_at limit 1;
  if tmpl is not null then
    insert into chapters (id, tenant_id, name, emoji, blurb, start_date, end_date, sort)
      select c.id || '_' || suffix, new_tid, c.name, c.emoji, c.blurb, c.start_date, c.end_date, c.sort
      from chapters c where c.tenant_id = tmpl;

    insert into objectives (id, tenant_id, name, region, commitment, grade, hazard, severity, discipline, beta, gpx_url, status, note, lat, lng, day_type, gpx_verified, sort)
      select o.id || '_' || suffix, new_tid, o.name, o.region, o.commitment, o.grade, o.hazard, o.severity, o.discipline, o.beta, o.gpx_url, o.status, o.note, o.lat, o.lng, o.day_type, o.gpx_verified, o.sort
      from objectives o where o.tenant_id = tmpl;

    insert into stops (id, "order", name, sub, emoji, date, flex, region, rendezvous, status, kind, source, note, off_route_mi, time_cost_min, tenant_id, lat, lng, dossier, start_date, end_date, chapter_id, objective_id, day_type)
      select s.id || '_' || suffix, s."order", s.name, s.sub, s.emoji, s.date, s.flex, s.region, s.rendezvous, s.status, s.kind, s.source, s.note, s.off_route_mi, s.time_cost_min, new_tid, s.lat, s.lng, s.dossier, s.start_date, s.end_date,
             case when s.chapter_id is not null then s.chapter_id || '_' || suffix end,
             case when s.objective_id is not null then s.objective_id || '_' || suffix end,
             s.day_type
      from stops s where s.tenant_id = tmpl;
  end if;

  return query select new_tid, new_slug;
end;
$$;

revoke all on function provision_trip(text, text) from public, anon;
grant execute on function provision_trip(text, text) to authenticated;
