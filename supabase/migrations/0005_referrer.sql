-- 0005_referrer.sql — Capture layer: self-serve invite links + attribution.
--
-- Decision (2026-07-01): ANYONE can generate a personal invite link, not just
-- leaders — church-wide invite culture. So `referrer` is DECOUPLED from
-- `membership`: a member with no login still gets a link. `member_id` is set only
-- when the inviter happens to be a leader/admin account (then they auto-own the
-- follow-up). Attribution rides the link's slug, captured on `person.referrer_id`.
set search_path to r20reach, public;

create table if not exists referrer (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references org(id) on delete cascade,
  slug        text not null,                  -- URL code in /join/<slug>
  name        text not null,                  -- inviter's display name
  phone_e164  text,                           -- OPTIONAL — enables the "your friend came!" loop
  member_id   uuid references membership(id), -- set only if the inviter is a leader/admin account
  created_at  timestamptz not null default now(),
  unique (org_id, slug)
);
create index if not exists referrer_org_idx on referrer (org_id);

-- Attribution on the captured person: who invited them + where they were captured.
alter table person add column if not exists referrer_id     uuid references referrer(id);
alter table person add column if not exists capture_surface text;  -- 'join_form' | 'qr' | ...
create index if not exists person_referrer_idx on person (referrer_id);
