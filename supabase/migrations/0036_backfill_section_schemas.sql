-- Slice 7: backfill the flagship trips' dossier schemas. David = climbing (ROUTES /
-- GEAR / SKILLS), Derek = road trip (PACKING LIST / EATS / FUEL). New trips get a
-- generic fallback from provision_trip; Sonnet (slice 8) tailors from intent.
update tenants set section_schema = '{"sections":[
  {"key":"routes","label":"Routes","icon":"🧗","fields":["routes"]},
  {"key":"approach","label":"Approach · Descent · Season","icon":"🥾","fields":["approach","descent","season"]},
  {"key":"gear","label":"Gear & Food","icon":"🎒","fields":["rack","ropes","footwear","mountaineering","food"]},
  {"key":"skills","label":"Skills Needed","icon":"🪢","fields":["skills"]},
  {"key":"hazards","label":"Hazards · Bail","icon":"⚠️","fields":["hazards","bail"]}
]}'::jsonb
where slug = 'david';

update tenants set section_schema = '{"sections":[
  {"key":"plan","label":"Day Plan","icon":"📍","fields":["plan","timing"]},
  {"key":"packing","label":"Packing List","icon":"🎒","fields":["essentials","layers","docs"]},
  {"key":"eats","label":"Eats & Coffee","icon":"🍔","fields":["food","coffee"]},
  {"key":"fuel","label":"Fuel & Range","icon":"⛽","fields":["gas","charging"]},
  {"key":"stay","label":"Where to Sleep","icon":"🛏️","fields":["sleep","resupply"]}
]}'::jsonb
where slug = 'derek';
