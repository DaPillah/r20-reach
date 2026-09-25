set search_path to r20reach, public;

-- The reply funnel (responded/no-response invite branching: reply_slug +
-- sms_replied/sms_first/sms_reengaged) is retired per Alex 2026-09-10
-- ("not needed"). Unused in every event row; the editor never surfaced it.
-- The event_reply table + person.replies plumbing stay (leader reply-marking
-- may return in a simpler form).
alter table event drop column if exists reply_slug;
alter table event drop column if exists sms_replied;
alter table event drop column if exists sms_first;
alter table event drop column if exists sms_reengaged;
