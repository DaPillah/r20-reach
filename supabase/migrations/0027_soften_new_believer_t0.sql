-- 0027_soften_new_believer_t0.sql — the New Believer journey can now auto-fire the
-- instant we get an explicit "I took a step toward Jesus" tap (see submitDecisionAction),
-- so T0 goes out without a human first eyeballing it. The old T0 over-claimed ("one of
-- the best decisions you'll ever make") — for a self-tapped decision the app shouldn't
-- pronounce assurance or launch the full affirmation before a pastor has even talked to
-- them. Soften to: honor the step, promise a real person, don't over-claim. The deeper
-- discipleship content (steps 2–3, skip_if_touched) still yields the moment a leader texts.
set search_path to r20reach, public;

update journey_step
   set body = 'so glad you reached out tonight — that took something real, and you''re not doing it alone. [OWNER_FIRST_NAME|someone from R20] is going to reach out personally, really soon. a real person, promise. 🙏'
 where id = 'aaaaaaaa-0000-0000-0000-000000000101';
