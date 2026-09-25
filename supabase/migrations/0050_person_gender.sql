-- 0050_person_gender.sql — optional gender on a person, for gender-specific
-- events/Hangouts and follow-up (a People filter + the event sign-in pill).
-- Self-selected or set by someone who knows them — NEVER inferred from a name.
-- null = not set.
set search_path to r20reach, public;

alter table person add column if not exists gender text
  check (gender in ('male', 'female', 'nonbinary'));
