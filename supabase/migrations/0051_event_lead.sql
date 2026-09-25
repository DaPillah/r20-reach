set search_path to r20reach, public;

-- Event leads: a leader who SEES everyone who signed up for a given event
-- (by slug), regardless of who owns those people. This is a READ grant — like
-- campus_lead but scoped to one event instead of a whole campus — so e.g. the
-- NYU leaders running the ice-cream-sandwich event can see its sign-ins even
-- though event captures are coordinator-owned. Today queues are unaffected
-- (Today still filters to owned/covered before computing nudges).
create table if not exists event_lead (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references org(id) on delete cascade,
  event_slug text not null,
  member_id  uuid not null references membership(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (org_id, event_slug, member_id)
);
create index if not exists event_lead_member_idx on event_lead(org_id, member_id);
