-- 0045_nights_reminder.sql — the "Come to Nights" reminder journey.
--
-- Alex (28 Aug): people captured at events, via the survey opt-in, or via
-- "I want to come to R20 Nights" should sit in the Campus funnel and be
-- REMINDED about the Saturday night until they actually come — the VisitorReach
-- idea, done our way: consent-gated (text + opted_in only; IG-only stays out of
-- SMS journeys), BOUNDED (4 Saturdays, not a year-long drip), every step
-- skip_if_touched (a leader's personal text pauses automation — human overtakes),
-- Saturday-only send window (11:00–17:00 ET — "tonight" language is always true),
-- and it completes the moment they show up (first-time/decision capture at a
-- Night). This deliberately SUPERSEDES the earlier "no journey auto-enroll from
-- surveys" call — the reminder loop is now the explicit design.
set search_path to r20reach, public;

insert into journey (id, org_id, name, is_active, entry_trigger)
  select 'dddddddd-0000-0000-0000-000000000001', id, 'Come to Nights', true, 'auto'
  from org where slug = 'r20'
on conflict (id) do nothing;

insert into journey_step
  (id, journey_id, sort_order, channel, delay_amount, delay_unit, send_window, respect_quiet_hours, skip_if_touched, body) values
  ('dddddddd-0000-0000-0000-000000000101', 'dddddddd-0000-0000-0000-000000000001', 1,
   'sms', 0, 'days', '{"days":["sat"],"earliest":"11:00","latest":"17:00"}', true, true,
   'hey [FIRST_NAME|friend], it''s [OWNER_FIRST_NAME|Dana] from R20 — tonight''s the night: R20 Nights, 7pm near Columbia. food, a real talk, open Q&A, zero pressure. want to come? reply here and i''ll send you the where + get you set at the gate. (reply STOP anytime to opt out)'),
  ('dddddddd-0000-0000-0000-000000000102', 'dddddddd-0000-0000-0000-000000000001', 2,
   'sms', 7, 'days', '{"days":["sat"],"earliest":"11:00","latest":"17:00"}', true, true,
   'hey [FIRST_NAME|friend] — R20 Nights is on again tonight, 7pm. a bunch of us are going and you''d genuinely be welcome. want me to save you a seat?'),
  ('dddddddd-0000-0000-0000-000000000103', 'dddddddd-0000-0000-0000-000000000001', 3,
   'sms', 7, 'days', '{"days":["sat"],"earliest":"11:00","latest":"17:00"}', true, true,
   '[FIRST_NAME|hey] — saturday again :) R20 Nights, 7pm: food, a real talk, and the open Q&A where you can push back on anything. if tonight''s not it, there''s always next week. want the details?'),
  ('dddddddd-0000-0000-0000-000000000104', 'dddddddd-0000-0000-0000-000000000001', 4,
   'sms', 7, 'days', '{"days":["sat"],"earliest":"11:00","latest":"17:00"}', true, true,
   'hey [FIRST_NAME|friend] — last nudge from me, promise. R20 Nights runs every saturday, 7pm, and you''re welcome any week — no explanation needed. hope we get to meet you. (reply STOP and i''ll stop texting)')
on conflict (id) do nothing;
