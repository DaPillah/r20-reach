-- Retire a leader login without deleting it. Campus-ministry rosters turn over
-- every year (graduations, step-backs), and until now the app had no way to take
-- a leader off the roster except a hard delete. deactivated_at is the humane,
-- reversible switch: a deactivated membership can't log in and drops off every
-- leader list / reflection nag, but the row (and its history) stays, so it can be
-- reactivated by clearing the column. Owned people should be reassigned first
-- (deactivation doesn't move them).
set search_path to r20reach, public;

alter table membership add column if not exists deactivated_at timestamptz;
alter table membership add column if not exists deactivated_reason text;
