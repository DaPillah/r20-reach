-- 0019_dormant.sql — "resting" / dormant tier. A leader can set someone down for
-- a season (not being actively pursued right now) WITHOUT archiving them. Dormant
-- people drop off the Today nudge queue but stay in the roster, visibly "resting,"
-- one tap to reconnect. This is the humane pressure-release valve from
-- ENGAGEMENT-HEALTH.md — distinct from archived_at (soft-delete / removal).
set search_path to r20reach, public;

alter table person add column if not exists dormant_at     timestamptz;
alter table person add column if not exists dormant_reason text;
create index if not exists person_dormant_idx on person (org_id) where dormant_at is not null;
