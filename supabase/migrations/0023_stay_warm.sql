-- 0023_stay_warm.sql — the "Stay Warm" long-tail journey (leader-enrollable).
--   A leader opts a QUIET person in ("keep them gently on my radar"). Unlike VR's
--   Follow Up (monthly-for-~a-year auto-drip to everyone silent), Stay Warm is:
--     • opt-in per person by a human, never auto-fired (auto-trigger from drift
--       detection is deferred to the post-launch engagement-health build);
--     • BOUNDED — 3 gentle touches over ~10 weeks (+14d, +30d, +30d), then it
--       completes (guilt-free stop; leader can then rest them to dormant);
--     • human-first — skip_if_touched on EVERY step, so any real contact pauses it;
--     • quick-reply voice — plain, no-agenda, one soft question, no Christianese.
--   Same LIGHT-automation design as Welcome/New Believer/Assimilation. Dry-run until
--   SMS_PROVIDER=twilio (10DLC). Consent re-checked per send (sms.ts); recipients are
--   already-consented members, so no T0 opt-in step.
set search_path to r20reach, public;

insert into journey (id, org_id, name, is_active, entry_trigger)
  select 'cccccccc-0000-0000-0000-000000000001', id, 'Stay Warm', true, 'manual'
  from org where slug = 'r20'
on conflict (id) do nothing;

insert into journey_step
  (id, journey_id, sort_order, channel, delay_amount, delay_unit, send_window, respect_quiet_hours, skip_if_touched, body) values
  ('cccccccc-0000-0000-0000-000000000101', 'cccccccc-0000-0000-0000-000000000001', 1,
   'sms', 14, 'days', '{"earliest":"12:00","latest":"18:00"}', true, true,
   'hey [FIRST_NAME|friend], no agenda — you crossed my mind and i just wanted to check in. how''ve you been lately?'),
  ('cccccccc-0000-0000-0000-000000000102', 'cccccccc-0000-0000-0000-000000000001', 2,
   'sms', 30, 'days', '{"earliest":"12:00","latest":"18:00"}', true, true,
   'hey [FIRST_NAME|friend], still thinking of you — no pressure at all. if you''re ever around on a saturday the door''s always open, and i''d love to catch up either way. how''s life?'),
  ('cccccccc-0000-0000-0000-000000000103', 'cccccccc-0000-0000-0000-000000000001', 3,
   'sms', 30, 'days', '{"earliest":"12:00","latest":"18:00"}', true, true,
   'hey [FIRST_NAME|friend] — not trying to blow up your phone, just want you to know you''re genuinely welcome anytime, and i''m around if you ever wanna talk. take care of yourself.')
on conflict (id) do nothing;
