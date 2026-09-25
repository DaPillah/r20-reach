set search_path to r20reach, public;

-- Day-of reminder mode for an RSVP event: when on, everyone who attended a
-- feeder event, was already texted the invite, and still hasn't RSVP'd comes
-- BACK onto their owner's Today queue with the event's second-touch text
-- pre-filled (normally a fresh touch hides them for DUE_AFTER_DAYS). Toggled
-- in /events on the day of the event; turn the event off afterward as usual.
alter table event add column if not exists remind boolean not null default false;
