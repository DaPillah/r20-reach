-- 0043_event_checkin_detail.sql — per-event extra ask on the event sign-in.
--
-- Some events need one more answer than name+contact: Find Your Classes (Mon Sept 7)
-- needs "which buildings are your classes in?" so the crews can pre-sort the five
-- groups the night before (the Sunday dorm-drop flyer QR points at
-- /event?e=find-your-classes). Generic `detail` column — which events ask, and what
-- they ask, lives in code (EVENT_DETAIL_PROMPTS in src/lib/events.ts).
set search_path to r20reach, public;

alter table event_checkin add column if not exists detail text;
