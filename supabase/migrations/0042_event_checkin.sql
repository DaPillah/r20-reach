-- 0042_event_checkin.sql — first-three-weeks EVENT SIGN-IN capture.
--
-- "We're getting people through the door — if we don't capture the contact, the
-- effort is wasted" (Columbia-lead meeting, 27 Aug). /event?e=<slug> is the QR /
-- link at games nights, the float social, field games. Unlike the survey, contact
-- is REQUIRED (the page exists to capture), so every check-in links a person —
-- created/matched at Campus via the shared capture path, surface 'event_checkin'.
-- The row keeps the event slug + first name so per-event counts survive person
-- merges/deletes. Events are "created" by printing a QR with a new slug — no
-- registry table, deliberately (the slug shape is whitelisted in code).
set search_path to r20reach, public;

create table if not exists event_checkin (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references org(id) on delete cascade,
  event_slug text not null,
  first_name text,
  src        text,                                          -- ?src= attribution (flyer / QR / IG)
  person_id  uuid references person(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists event_checkin_org_event on event_checkin (org_id, event_slug, created_at);
