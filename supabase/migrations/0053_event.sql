set search_path to r20reach, public;

-- In-app event definitions — moves EVENT_RSVP / EVENT_PHRASE out of code so a
-- coordinator can create/edit an event + its invite text in the app (no deploy).
-- The RSVP page, link-preview (OG) metadata, and the invite pre-fill all read
-- from here once the code is switched over. `event_checkin` still keys off the
-- bare slug (unchanged); this table just gives a slug its human-facing config.
create table if not exists event (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references org(id) on delete cascade,
  slug         text not null,                 -- matches ?e=<slug> and event_checkin.event_slug
  label        text,                          -- display name (fallback: title-cased slug)
  headline     text,                          -- RSVP page hero, e.g. "Pizza in the park."
  when_text    text,                          -- human date/time, e.g. "Mon 9/7 (Labor Day) · 7pm"
  where_text   text,                          -- location line
  phrase       text,                          -- how it reads in {event}, e.g. "the ice cream social"
  is_rsvp      boolean not null default false, -- future-tense RSVP page vs at-the-door sign-in
  active       boolean not null default true,  -- soft on/off: drops from the pre-fill without deleting
  sms          text,                           -- invite draft; merge tags {name}{leader}{event}{when}{where}{link}{ig}
  sms_followup text,                           -- auto second touch (IG-forward)
  feeders      text[] not null default '{}',   -- past-event slugs whose attendees this invites
  sort_order   int not null default 0,         -- tie-break when a person qualifies for several
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (org_id, slug)
);
create index if not exists event_org_active_idx on event(org_id, active);

-- NOTE: seeding from the current code constants (game-night, park-pizza,
-- icecream-* phrases) happens in the refactor step, not here, so this migration
-- stays a pure additive schema change with zero runtime effect until code reads
-- from it. Apply AFTER game night, alongside the code switch-over.
