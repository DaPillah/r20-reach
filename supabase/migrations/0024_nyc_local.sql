-- 0024_nyc_local.sql — flag members whose home base is NYC, so they can't be lost
-- over the summer/breaks. R20 wants a "strong summer pool": the students who stay in
-- the city year-round are exactly who leaders should keep meeting up with when campus
-- empties out. Leader-set boolean (false = not flagged / unknown); surfaced as a
-- profile toggle + a People filter. Distinct from `stage`/`serving` — it's logistics.
set search_path to r20reach, public;

alter table person add column if not exists nyc_local boolean not null default false;
create index if not exists person_nyc_local_ix on person (org_id) where nyc_local;
