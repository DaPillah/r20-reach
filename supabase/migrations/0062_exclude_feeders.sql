set search_path to r20reach, public;

-- Negative targeting for an RSVP push: attendees of any exclude_feeders slug
-- are NOT invited even when they match a feeder (e.g. Family Feud night goes
-- to all Columbia event alumni EXCEPT sip-and-paint attendees, including the
-- girls who also came to the float).
alter table event add column if not exists exclude_feeders text[] not null default '{}';
