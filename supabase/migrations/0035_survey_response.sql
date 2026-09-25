-- 0035_survey_response.sql — fold the R20 30-Second Survey INTO the Oikos capture
-- flow (was headed for a standalone Google Sheet).
--
-- survey_response is the "learn the field" listening store. Every submission
-- (Q1–Q4b) is kept org-scoped and ANONYMOUS by default so the campus lead can pool
-- themes monthly and hand them to sermon/bridge prep. If a student opts in with
-- contact we ALSO create a `person` at Campus and link it via person_id — but the
-- survey answers are the data, and they are NEVER auto-labeled onto a soul (locked
-- rule: response capture ≠ labeling).
--
-- Multi-select answers are text[] of STABLE KEYS (see src/lib/survey.ts), not display
-- labels, so the aggregate counts survive a copy reword. Q4b ("instant turn-off") is
-- stored as text[] too — a superset of single-choice — so the form can be single- or
-- multi-select without a schema change (v1 renders it multi-select per the source
-- instrument's "check any that apply"; flip in the UI only if Alex wants one answer).
--
-- CONTACT-CHANNEL FIELDS: preferred_contact + instagram_handle on `person` are added
-- by 0034_instagram_channel.sql (the concurrent Instagram-DM task, which landed
-- first). This migration REUSES them — the survey opt-in writes preferred_contact
-- ('text'|'instagram') + instagram_handle exactly as the manual-add path does. It
-- deliberately does NOT re-declare those columns (no duplicate migration).
set search_path to r20reach, public;

create table if not exists survey_response (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references org(id) on delete cascade,
  q1_experience  text,                              -- single: success|friendships|fun|fulfillment|love
  q2_spiritual   int check (q2_spiritual is null or (q2_spiritual between 1 and 10)),
  q3_writeoff    text[] not null default '{}',      -- keys from Q3_OPTIONS
  q3_other       text,
  q4a_worthwhile text[] not null default '{}',      -- keys from Q4A_OPTIONS
  q4a_other      text,
  q4b_turnoff    text[] not null default '{}',      -- keys from Q4B_OPTIONS
  q4b_other      text,
  src            text,                              -- ?src= attribution (which campus / QR / leader)
  person_id      uuid references person(id) on delete set null,  -- set ONLY if they opted in with contact
  created_at     timestamptz not null default now()
);
create index if not exists survey_response_org_created on survey_response (org_id, created_at);
