-- 0040_school_year.sql — where a person is in school. Drives funnel filters and
-- broadcast targeting ("text the first-years"); first-years are R20's strategic
-- center (Carman/John Jay). null = unknown; filled via Edit/Add person.
set search_path to r20reach, public;

alter table person add column if not exists school_year text
  check (school_year in ('first_year','sophomore','junior','senior','grad'));
