-- Slice 5a: the Seattle/PNW (World Cup) starter template. is_template=true hides it
-- from public listings; provision_trip() deep-copies it into each new trip.
insert into tenants (id, slug, name, tagline, visibility, is_template, interests, section_schema)
values (
  '11111111-1111-1111-1111-111111111111',
  'template-seattle-pnw',
  'Seattle / PNW Starter',
  'World Cup 2026 + a Pacific Northwest loop — clone it and make it yours',
  'private', true, '{}',
  '{"sections":[
    {"key":"plan","label":"Day Plan","icon":"📍","fields":["plan","timing"]},
    {"key":"packing","label":"Packing List","icon":"🎒","fields":["essentials","layers","docs"]},
    {"key":"eats","label":"Eats & Coffee","icon":"🍔","fields":["food","coffee"]},
    {"key":"stay","label":"Where to Sleep","icon":"🛏️","fields":["sleep","resupply"]},
    {"key":"notes","label":"Notes","icon":"📝","fields":["misc"]}
  ]}'::jsonb
)
on conflict (slug) do update set
  name = excluded.name, tagline = excluded.tagline, is_template = true,
  visibility = 'private', section_schema = excluded.section_schema;

insert into chapters (id, tenant_id, name, emoji, blurb, start_date, end_date, sort) values
  ('tmpl-arrive', '11111111-1111-1111-1111-111111111111', 'Arrive', '✈️', 'Land in Seattle, settle in, shake off the travel.', '2026-06-12', '2026-06-14', 1),
  ('tmpl-matches', '11111111-1111-1111-1111-111111111111', 'Match Days', '⚽', 'World Cup fixtures + fan zones around the city.', '2026-06-15', '2026-06-26', 2),
  ('tmpl-pnw', '11111111-1111-1111-1111-111111111111', 'PNW Loop', '🌲', 'Cascades, Rainier, and the Olympic coast.', '2026-06-27', '2026-07-05', 3)
on conflict (id) do nothing;

-- generic day-activities (objectives.day_type only allows crag/alpine, so null here)
insert into objectives (id, tenant_id, name, region, day_type, status, note, lat, lng, beta) values
  ('tmpl-pikeplace', '11111111-1111-1111-1111-111111111111', 'Pike Place & the Waterfront', 'Seattle', null, 'confirmed', 'Easy first-day wander.', 47.6097, -122.3422,
    '{"summary":"Market, the original Starbucks, the waterfront and Olympic Sculpture Park — a gentle day-one loop on foot."}'::jsonb),
  ('tmpl-rainier', '11111111-1111-1111-1111-111111111111', 'Mount Rainier — Skyline Trail', 'Cascades', null, 'confirmed', 'Wildflower meadows + glacier views.', 46.7857, -121.7351,
    '{"summary":"5.5-mi loop from Paradise with big Rainier and Tatoosh views. Snow can linger into July — check the WTA trip reports."}'::jsonb)
on conflict (id) do nothing;

-- stops MUST carry tenant_id (nullable, no default — omitting it orphans the row)
insert into stops (id, "order", name, sub, emoji, region, status, kind, lat, lng, start_date, chapter_id, objective_id, day_type, tenant_id) values
  ('tmpl-s1', 1, 'Seattle', 'Home base for the matches', '🏙️', 'Seattle', 'confirmed', 'stop', 47.6062, -122.3321, '2026-06-12', 'tmpl-arrive', null, 'travel', '11111111-1111-1111-1111-111111111111'),
  ('tmpl-s2', 2, 'Pike Place', 'Day-one wander', '🦀', 'Seattle', 'confirmed', 'stop', 47.6097, -122.3422, '2026-06-13', 'tmpl-arrive', 'tmpl-pikeplace', 'travel', '11111111-1111-1111-1111-111111111111'),
  ('tmpl-s3', 3, 'Lumen Field', 'Match day', '⚽', 'Seattle', 'confirmed', 'stop', 47.5952, -122.3316, '2026-06-15', 'tmpl-matches', null, 'travel', '11111111-1111-1111-1111-111111111111'),
  ('tmpl-s4', 4, 'Mount Rainier NP', 'Skyline Trail', '🏔️', 'Cascades', 'confirmed', 'stop', 46.7857, -121.7351, '2026-06-28', 'tmpl-pnw', 'tmpl-rainier', 'recovery', '11111111-1111-1111-1111-111111111111'),
  ('tmpl-s5', 5, 'Olympic Coast', 'Rialto / Ruby Beach', '🌊', 'Olympic', 'confirmed', 'stop', 47.9189, -124.6360, '2026-07-02', 'tmpl-pnw', null, 'travel', '11111111-1111-1111-1111-111111111111')
on conflict (id) do nothing;
