-- 0046_survey_excited.sql — survey v3: one warm question.
--
-- The instrument drops to a SINGLE question — "What are you most excited about
-- this year?" (single choice + a "Something else" free-text) — then the opt-in.
-- The v2 identity question and the spiritual 1-10 scale are retired FROM THE FORM
-- (kept as columns so the responses already collected keep their value; /overview
-- shows the legacy bars only while they hold data). Rationale: for launch season
-- the survey's job is a warm street-intercept opener + a consented contact, and a
-- single disarming question maximizes both completion and opt-in.
set search_path to r20reach, public;

alter table survey_response add column if not exists q_excited text;
alter table survey_response add column if not exists q_excited_other text;
