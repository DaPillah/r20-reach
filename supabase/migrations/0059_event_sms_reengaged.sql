set search_path to r20reach, public;

-- Re-engagement invite: for a funnel event, the draft shown once a leader marks
-- that a person replied to THIS event's nudge (an event_reply row for this slug).
-- Lets the soft nudge (`sms`) drop the link and gauge interest first, then hand
-- the link only to people who responded. Null → no re-engagement step.
alter table event add column if not exists sms_reengaged text;
