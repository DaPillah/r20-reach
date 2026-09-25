-- 0025_summer_reason.sql — widen the summer/breaks pool (0024's nyc_local) with a
-- REASON, so we can specially care for the students most at risk of being alone over
-- the summer: international students and anyone with no family to go home to. Alex:
-- "for international students specifically (or people who don't have families to go
-- to), we will want to make sure that we're taking care of them over the summer."
-- nyc_local stays the boolean "around over summer/breaks"; summer_reason tags WHY.
--   'local' | 'international' | 'no_family' | 'other' (nullable = around, reason unset)
set search_path to r20reach, public;

alter table person add column if not exists summer_reason text;
