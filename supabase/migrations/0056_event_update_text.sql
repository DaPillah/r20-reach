set search_path to r20reach, public;

-- Update text for people who ALREADY RSVP'd: when a remind-mode event has
-- sms_update set, its RSVP'd/attendees surface on Today with this draft (the
-- reminder wave deliberately excludes them). Built for "we moved the time"
-- corrections — the invitees get the reminder, the RSVP'd get the update.
alter table event add column if not exists sms_update text;
