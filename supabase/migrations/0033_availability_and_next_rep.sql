-- Leader-development #8. Two additions to the growth map (DHM's essentials are a
-- growth map, not a gate):
--   • 'availability' — R20's own entry bar ("were you actually there?"), the thing
--     that most quietly decays mid-semester with nowhere to write it down. Same
--     self-beside-pastor structure, narrative + growing/steady/stretch, no scores.
--     (NB: 'feeding' was considered and dropped — opening the Word is the teaching
--     pastor's job, not a Hangout-leader growth axis.)
--   • next_rep — a one-line "next rep, with a date" on the overall ladder row.
--     The ladder records where a leader IS (leading→raising→sending); this records
--     what's NEXT, turning the Growth tab from a review into a plan.
set search_path to r20reach, public;

alter table growth_entry drop constraint if exists growth_entry_dimension_check;
alter table growth_entry add constraint growth_entry_dimension_check
  check (dimension in
    ('warmth','availability','shepherding','facilitation','safe_room',
     'outreach','multiplication','overall'));

alter table growth_entry add column if not exists next_rep text;   -- overall row only
