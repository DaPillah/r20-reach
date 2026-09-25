-- 0038_survey_surveyor.sql — who administered the survey. Populated from a
-- ?by=<name> link param (persisted in localStorage on the surveyor's phone), so
-- helpers who aren't app users can be credited with plain per-person links like
-- survey.r20.nyc?by=Chris. Free text, not a membership FK, for exactly that
-- reason. Anonymity of the RESPONDENT is unchanged.
set search_path to r20reach, public;

alter table survey_response add column if not exists surveyor text;
