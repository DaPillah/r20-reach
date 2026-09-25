-- 0013_hold_t2_and_draft_templates.sql
--
-- 1) HOLD T2 UNTIL LAUNCH (Alex, 2026-07-03): R20 Nights isn't weekly yet, so
--    the "come saturday night" invite can't run — the Welcome journey is T0+T1
--    only for now. Re-add T2 at the Sept launch (copy + config preserved in
--    0012; also on the go-live checklist in HANDOFF.md). Any enrollment already
--    sitting on T2 has had T0+T1 → completing it is the correct semantics.
--
-- 2) PER-LEADER DRAFT TEMPLATES: each member can customize the pre-written
--    Today-queue texts in their own voice (e.g. Alex's "how's it going g").
--    jsonb keyed by draft kind: new | crowd | community | committed | checkin;
--    [FIRST_NAME] merge tag; empty/missing key = app default.
set search_path to r20reach, public;

update journey_enrollment
   set status = 'completed', current_step_id = null, scheduled_for = null
 where current_step_id = '88888888-0000-0000-0000-000000000103';

delete from journey_step where id = '88888888-0000-0000-0000-000000000103';

alter table membership add column if not exists draft_templates jsonb not null default '{}';
