set search_path to r20reach, public;

-- Post-event thank-you mode: when on, everyone who CHECKED IN at this event
-- (its own event_checkin rows, not feeders) surfaces on their owner's Today
-- with sms_thanks pre-filled. The event lifecycle in /events becomes:
-- invite (active+is_rsvp) → day-of reminder (remind) → thank-you (thanks) → off.
alter table event add column if not exists thanks boolean not null default false;
alter table event add column if not exists sms_thanks text;
