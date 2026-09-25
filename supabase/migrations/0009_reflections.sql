-- 0009_reflections.sql — Leader weekly reflections + structured Hangout attendance,
-- and the semester leader-growth (evaluation) layer.
--
-- Design notes:
-- * A `reflection` is one Bible Hangout meeting, authored by the leader (membership).
--   Attendance is STRUCTURED against real person records (reflection_attendance),
--   so headcounts are DERIVED, never typed. New guests are created as normal person
--   rows (owner = the leader) via the action layer and flow into the funnel; marking
--   attendance is also what organically builds the real Hangout rosters over time.
-- * `leader_personal` ("How I'm doing personally") is pastoral-gated in the action
--   layer (author + pastoral_oversight only), like pastoral notes. Everything else on
--   a reflection is leadership/eval material visible to admins.
-- * Leader growth is tracked NARRATIVE-FIRST, no numeric scores (research: assigned
--   numbers demotivate). Optional non-numeric self-marker only. `growth_entry` is a
--   SHARED structure: the same six dimensions carry both the leader's SELF entry and
--   the pastor's entry, so the eval view renders self-beside-pastor per dimension. A
--   special dimension='overall' row carries the Leading→Raising→Sending ladder.
-- (gen_random_uuid() is built into Postgres 13+, no extension needed.)
set search_path to r20reach, public;

-- One Bible Hangout meeting + the leader's written reflection.
create table if not exists reflection (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references org(id) on delete cascade,
  author_id        uuid not null references membership(id),  -- the leader
  occurred_on      date not null default current_date,
  expected_count   int,                 -- optional leader estimate; attended is DERIVED
  key_moment       text,                -- spiritual moment from the study
  concern_followup text,                -- anyone I'm concerned about / following up with
  leader_personal  text,                -- "How I'm doing personally" — PASTORAL-GATED
  created_at       timestamptz not null default now()
);
create index if not exists reflection_author_idx on reflection (org_id, author_id, occurred_on desc);

-- Structured attendance: one row per person per meeting. Present/absent against the
-- leader's real roster; new guests are added as person rows, then marked present here.
create table if not exists reflection_attendance (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references org(id) on delete cascade,
  reflection_id uuid not null references reflection(id) on delete cascade,
  person_id     uuid not null references person(id) on delete cascade,
  status        text not null check (status in ('present','absent')),
  created_at    timestamptz not null default now(),
  unique (reflection_id, person_id)
);
create index if not exists reflection_attendance_person_idx on reflection_attendance (org_id, person_id);

-- Semester leader-growth entries. Narrative-first; optional non-numeric self-marker.
-- Shared by SELF (the leader) and PASTOR (reviewer) across the same six dimensions,
-- so one row per (leader, term, dimension, author_kind) — upsert on edit.
create table if not exists growth_entry (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references org(id) on delete cascade,
  subject_id   uuid not null references membership(id),   -- the leader being grown
  term         text not null,                             -- e.g. 'Fall 2026'
  dimension    text not null check (dimension in
                 ('warmth','shepherding','facilitation','safe_room',
                  'outreach','multiplication','overall')),
  author_kind  text not null check (author_kind in ('self','pastor')),
  author_id    uuid not null references membership(id),   -- who wrote this entry
  marker       text check (marker in ('growing','steady','stretch')),
  ladder       text check (ladder in ('leading','raising','sending')),  -- overall row only
  body         text,
  updated_at   timestamptz not null default now(),
  unique (subject_id, term, dimension, author_kind)
);
create index if not exists growth_entry_subject_idx on growth_entry (org_id, subject_id, term);
