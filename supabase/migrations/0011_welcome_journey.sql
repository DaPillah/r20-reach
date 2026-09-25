-- 0011_welcome_journey.sql — Track B scaffold: seed the consent-gated Welcome
-- journey. Copy matches the 10DLC-registered samples (10DLC-SETUP.md) verbatim
-- in spirit: step 1 is the REQUIRED opt-in confirmation (carriers expect it as
-- the first automated text), step 2 the personal welcome the next day.
--
-- Enrollment happens in submitJoinAction ONLY when a phone + explicit consent
-- were given. Sends are processed by /api/sweep through src/lib/sms.ts, which is
-- in DRY-RUN mode (status='dry_run', no real texts) until SMS_PROVIDER=twilio —
-- i.e. after the 10DLC campaign verifies. Fixed UUIDs per seed convention.
set search_path to r20reach, public;

insert into journey (id, org_id, name, is_active, entry_trigger) values
  ('88888888-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001',
   'Welcome (consented capture)', true, 'manual')
on conflict (id) do nothing;

insert into journey_step
  (id, journey_id, sort_order, channel, delay_amount, delay_unit, respect_quiet_hours, body) values
  ('88888888-0000-0000-0000-000000000101', '88888888-0000-0000-0000-000000000001', 1,
   'sms', 0, 'minutes', false,  -- opt-in confirmation should go immediately, any hour
   'R20 Campus Ministry: You''re subscribed to R20 texts. Msg&data rates may apply. Msg frequency varies. Reply HELP for help, STOP to unsubscribe.'),
  ('88888888-0000-0000-0000-000000000102', '88888888-0000-0000-0000-000000000001', 2,
   'sms', 1, 'days', true,
   'Hi [FIRST_NAME|friend], it''s R20 — really glad you connected with us. R20 is a Saturday night gathering for students who are curious. Anything we can be praying about for you? Reply STOP to opt out.')
on conflict (id) do nothing;
