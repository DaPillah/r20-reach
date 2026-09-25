set search_path to r20reach, public;

-- Who replied to a given event's reach-out. A leader marks this by hand (the app
-- can't see inbound texts), and the NEXT event branches its invite draft on it:
-- a replier gets the warm "come to the next one" template, everyone else gets the
-- softer "sorry to double-text" one. Keyed by (person, event_slug) so it's scoped
-- to a specific reach-out and never goes stale across events.
create table if not exists event_reply (
  org_id       uuid not null references org(id) on delete cascade,
  person_id    uuid not null references person(id) on delete cascade,
  event_slug   text not null,                 -- the reach-out they replied to (e.g. 'game-night')
  replied_at   timestamptz not null default now(),
  by_member_id uuid references membership(id) on delete set null, -- who marked it
  primary key (org_id, person_id, event_slug)
);
create index if not exists event_reply_person_idx on event_reply(person_id);

-- Two new knobs on an event:
--   sms_replied — the invite draft for people who replied to reply_slug's reach-out.
--   reply_slug  — which prior event's replies gate the sms_replied vs sms choice.
-- Both null on existing rows → exactly the current single-template behavior.
alter table event add column if not exists sms_replied text;
alter table event add column if not exists reply_slug  text;
