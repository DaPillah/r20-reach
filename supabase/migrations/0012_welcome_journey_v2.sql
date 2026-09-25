-- 0012_welcome_journey_v2.sql — Welcome journey redesigned per the evidence
-- brief (2026-07-03, Alex confirmed LIGHT automation): max 3 automated touches,
-- automation is the FALLBACK — the leader's personal text from Today is the
-- primary (SPEC reliability model A); any human touch ends the automation.
--
-- skip_if_touched: when true, the sweep checks person.last_touch_at — if a
-- human has touched the person since enrollment, the enrollment is paused
-- (paused_reason='human_engaged') instead of sending. "A person being
-- personally texted by a leader never receives an automated send."
set search_path to r20reach, public;

alter table journey_step add column if not exists skip_if_touched boolean not null default false;

-- T0 — instant opt-in confirmation (carrier-required elements) + human signpost.
update journey_step set
  body = 'R20 Campus Ministry: You''re subscribed to R20 texts. [OWNER_FIRST_NAME|One of our leaders] will text you soon — a real person, promise. Msg&data rates may apply. Msg frequency varies. Reply HELP for help, STOP to unsubscribe.'
where id = '88888888-0000-0000-0000-000000000101';

-- T1 — the 24h-fallback "human" welcome (same voice as the Today-queue draft
-- leaders send manually, so the seam is invisible). 12–3pm ET window (research:
-- conversational touches). Skipped entirely if the leader already reached out.
update journey_step set
  delay_amount = 1, delay_unit = 'days',
  send_window = '{"earliest":"12:00","latest":"15:00"}',
  skip_if_touched = true,
  body = 'hey [FIRST_NAME|friend], it''s [OWNER_FIRST_NAME|one of the leaders] from R20 — really glad you connected with us. no agenda, just wanted to say hi. how''s your week going?'
where id = '88888888-0000-0000-0000-000000000102';

-- T2 — Saturday-night invite, Thu/Fri 4–7pm ET (research: action asks land
-- 4–7pm; 24h-before is the highest-value reminder). Last automated touch —
-- no step 4 exists, so the enrollment completes here. Also skipped if a human
-- is engaged. (Day-of nudges to interested people are the LEADER's job — a
-- reply ejects a person from automation permanently once webhooks land.)
insert into journey_step
  (id, journey_id, sort_order, channel, delay_amount, delay_unit, send_window, respect_quiet_hours, skip_if_touched, body) values
  ('88888888-0000-0000-0000-000000000103', '88888888-0000-0000-0000-000000000001', 3,
   'sms', 2, 'days', '{"days":["thu","fri"],"earliest":"16:00","latest":"19:00"}', true, true,
   'hey [FIRST_NAME|friend], we''re getting together saturday night — want to come? happy to meet you at the door so you don''t walk in alone.')
on conflict (id) do nothing;
