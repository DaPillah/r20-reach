-- 0028_apprentice_of.sql — make "raising an apprentice" first-class (SUCCESSION.md).
-- Until now the Raising & Sending lens inferred whether a leader is raising someone
-- from their `multiplication` growth note (prose). This adds a real link: a person
-- in a leader's Hangout can be marked as that leader's apprentice, so the lens can
-- show the actual raising-tree ("Maria is raising Ada + Ben") — R20's "we plant, we
-- don't split" made legible. apprentice_of = the membership id of the leader raising
-- them (their owner). Nullable = not an apprentice. Owner-or-admin sets it.
set search_path to r20reach, public;

alter table person add column if not exists apprentice_of uuid references membership(id);
create index if not exists person_apprentice_of_ix on person (org_id, apprentice_of) where apprentice_of is not null;
