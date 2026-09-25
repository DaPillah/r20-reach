set search_path to r20reach, public;

-- IG private-account dead-end: the leader tapped DM, hit a private profile,
-- and could only send a FOLLOW REQUEST — no message went out. Stamp it so the
-- queue can resurface "did they follow back?" checks every couple of days
-- instead of treating the tap as a completed touch. Cleared when a real DM is
-- logged (instagram_dm).
alter table person add column if not exists follow_requested_at timestamptz;
