-- 0026_acquisition_src.sql — Reach Phase-2. Tag every captured person with WHERE
-- they came from (an ?src= param on the QR / ad / poster / campus link), so the
-- Movement snapshot can attribute new people to a channel and we can finally read
-- ad ROI ("the $600 Sept build brought N people"). First-touch only — set on
-- create, never overwritten, so the origin is preserved even if they re-tap a
-- different link later. Pairs with the new first-time-guest-at-Nights capture,
-- which is the true Campus→Crowd conversion event.
set search_path to r20reach, public;

alter table person add column if not exists acquisition_src text;
create index if not exists person_acquisition_src_ix
  on person (org_id) where acquisition_src is not null;
