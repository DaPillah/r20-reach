set search_path to r20reach, public;

-- When a wave (day-of reminder / thank-you) was switched ON. The Today waves
-- only surface people whose last_touch_at is OLDER than the wave's start — so
-- one send during the wave satisfies it and the person drops to "Recently
-- texted" instead of re-carding at the bottom of the queue (Maria's bug, 9/10).
alter table event add column if not exists remind_since timestamptz;
alter table event add column if not exists thanks_since timestamptz;
-- Backfill live waves: updated_at ≈ when the toggle was last flipped.
update event set remind_since = updated_at where remind and remind_since is null;
update event set thanks_since = updated_at where thanks and thanks_since is null;
