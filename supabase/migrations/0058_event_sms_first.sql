set search_path to r20reach, public;

-- First-contact invite for people in a reply-branching event's pool who were
-- NEVER texted (no logged touch). Without this they'd fall to `sms` (the
-- "sorry to double-text" re-ask), which is wrong for a first message. Null →
-- never-texted people just get `sms` (prior behavior).
alter table event add column if not exists sms_first text;
