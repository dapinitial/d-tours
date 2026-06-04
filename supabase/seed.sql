-- Optional seed: mirrors src/lib/mock.ts so a live DB looks like the demo.
-- Run after 0001_init.sql. Idempotent-ish (truncate first if re-seeding).

insert into stops (id,"order",name,sub,emoji,date,flex,region,rendezvous) values
 ('s1',1,'Austin','Launch','🚀','Early July','open','TX',null),
 ('s2',2,'Dallas','Refuel & Whitley · Deep Ellum beers','⛽',null,'soft','TX',null),
 ('s3',3,'The Rez','Oklahoma','🪶',null,'open','OK',null),
 ('s4',4,'Southern CO','Shelf Road cragging','⛰️',null,'soft','CO',null),
 ('s5',5,'Denver / FoCo','Chels, Jillian & Fam · a hike','👥',null,'soft','CO',null),
 ('s6',6,'The Winds','Cirque of the Towers','🏔️','Mid-July','soft','WY',null),
 ('s7',7,'City of Rocks','Desert granite','🪨',null,'soft','ID',null),
 ('s8',8,'Flathead / Glacier','Rendezvous with Derek','🏞️','Jul 21','soft','MT','Derek — solar camper from Grand Rapids'),
 ('s9',9,'Spokane','Ricardo''s Wedding — HARD deadline','💍','Aug 1','hard','WA',null),
 ('s10',10,'Mazama','North Cascades','🌲',null,'soft','WA',null),
 ('s11',11,'Squamish','The finish','🧗',null,'open','BC',null)
on conflict (id) do nothing;

insert into crew (email, display_name, is_owner) values
 ('me@davidpuerto.com','David',true)
on conflict (email) do nothing;
