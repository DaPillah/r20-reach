-- 0037_feedback_phone.sql — optional phone number on the post-Nights pulse.
-- "Anything you'd tell us?" sometimes deserves a human reply; the number makes
-- that possible. Still NOT a person row and NOT SMS consent — the number lives
-- only on the feedback row, surfaced to admins on /overview for a manual,
-- human text back. Never enrolled in journeys, never enters the consent ledger.
set search_path to r20reach, public;

alter table service_feedback add column if not exists phone text;
