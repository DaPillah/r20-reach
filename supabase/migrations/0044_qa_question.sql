-- 0044_qa_question.sql — the live Q&A question stack.
--
-- The redesigned night ends with an open Q&A (food ~30 min, then back in the hall):
-- questions are TEXTED IN via the tap card — nobody walks to a mic. The old
-- "question" capture only flagged that someone had a question; the Q&A needs the
-- question ITSELF, readable by the moderator during the food window (/overview).
-- Anonymous by design: name optional, no contact required — friction kills
-- mid-sermon questions. No person row is created (no contact = nothing to own).
set search_path to r20reach, public;

create table if not exists qa_question (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references org(id) on delete cascade,
  body       text not null,
  first_name text,                       -- optional — read aloud only if given
  src        text,
  created_at timestamptz not null default now()
);
create index if not exists qa_question_org_created on qa_question (org_id, created_at);
