-- 0022_disciple_journeys.sql — two more Track-B journeys beyond Welcome:
--   (1) New Believer — for someone who responds at R20 Nights ("I took a step").
--       Routes to BELONGING (a Hangout) via a real person, NOT to a class first
--       (see the routing decision: relationship-first retention; 101 follows).
--   (2) Assimilation — for a first-time guest, nurturing Crowd → Community → a
--       Hangout, with 101 surfaced as the belonging step.
-- Same design as Welcome (0012): LIGHT automation, human-primary. skip_if_touched
-- on the follow-ups so a person a leader is already texting never gets an auto-send.
-- Content is seeded now; enrollment triggers get wired when the altar-call capture
-- (link tree) + first-visit capture land. Dry-run until SMS_PROVIDER=twilio (10DLC).
-- Opt-in/compliance is assumed handled at capture (as with Welcome's T0).
set search_path to r20reach, public;

-- ── (1) New Believer ────────────────────────────────────────────────────────
insert into journey (id, org_id, name, is_active, entry_trigger)
  select 'aaaaaaaa-0000-0000-0000-000000000001', id, 'New Believer', true, 'manual'
  from org where slug = 'r20'
on conflict (id) do nothing;

insert into journey_step
  (id, journey_id, sort_order, channel, delay_amount, delay_unit, send_window, respect_quiet_hours, skip_if_touched, body) values
  ('aaaaaaaa-0000-0000-0000-000000000101', 'aaaaaaaa-0000-0000-0000-000000000001', 1,
   'sms', 0, 'minutes', null, true, false,
   'so glad you took that step tonight — honestly one of the best decisions you''ll ever make, and you''re not walking it alone. [OWNER_FIRST_NAME|one of our leaders] will reach out personally soon. a real person, promise.'),
  ('aaaaaaaa-0000-0000-0000-000000000102', 'aaaaaaaa-0000-0000-0000-000000000001', 2,
   'sms', 1, 'days', '{"earliest":"12:00","latest":"15:00"}', true, true,
   'hey [FIRST_NAME|friend], it''s [OWNER_FIRST_NAME|one of the leaders] from R20 — still thinking about saturday, that was huge. no agenda, i''d just love to grab coffee this week and hear where you''re at. you around?'),
  ('aaaaaaaa-0000-0000-0000-000000000103', 'aaaaaaaa-0000-0000-0000-000000000001', 3,
   'sms', 3, 'days', '{"earliest":"12:00","latest":"18:00"}', true, true,
   'hey [FIRST_NAME|friend] — one of the best things right now is getting around a few people walking the same road. we''ve got a small midweek hangout that''s low-key and real, no performance. want me to introduce you?')
on conflict (id) do nothing;

-- ── (2) Assimilation ────────────────────────────────────────────────────────
insert into journey (id, org_id, name, is_active, entry_trigger)
  select 'bbbbbbbb-0000-0000-0000-000000000001', id, 'Assimilation', true, 'manual'
  from org where slug = 'r20'
on conflict (id) do nothing;

insert into journey_step
  (id, journey_id, sort_order, channel, delay_amount, delay_unit, send_window, respect_quiet_hours, skip_if_touched, body) values
  ('bbbbbbbb-0000-0000-0000-000000000101', 'bbbbbbbb-0000-0000-0000-000000000001', 1,
   'sms', 1, 'days', '{"earliest":"12:00","latest":"15:00"}', true, true,
   'so good to have you at R20, [FIRST_NAME|friend]. genuinely curious — what did you think? (even the critical take, i can take it.)'),
  ('bbbbbbbb-0000-0000-0000-000000000102', 'bbbbbbbb-0000-0000-0000-000000000001', 2,
   'sms', 3, 'days', '{"earliest":"12:00","latest":"18:00"}', true, true,
   'hey [FIRST_NAME|friend], the honest best way to actually know people here isn''t the saturday thing — it''s a bible hangout. small, midweek, come-as-you-are, no pressure. want me to connect you to one near you?'),
  ('bbbbbbbb-0000-0000-0000-000000000103', 'bbbbbbbb-0000-0000-0000-000000000001', 3,
   'sms', 5, 'days', '{"earliest":"12:00","latest":"18:00"}', true, true,
   'hey [FIRST_NAME|friend] — we also do a super low-key intro over food called R20 101: basically "what is this, and do i belong here." zero commitment. want the details?')
on conflict (id) do nothing;
