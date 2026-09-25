-- Close the reflection loop. The weekly leader reflection (0009) has been a
-- one-way write — a leader submits into a void. This adds a pastoral reply so the
-- leader gets seen: retrieval practice is worth more when the person is re-exposed
-- to what they couldn't retrieve, and a reflection written into silence loses that.
--
-- Gated exactly like reflection.leader_personal: written + read by pastoral
-- oversight only (Alex/Priya), enforced in the server action. Rendered back UNDER
-- the leader's own entry on /reflections — the leader must see it; that's the point.
-- Ops admins (Dana/Robin) never see reflections at all, so never these.
-- No scores, no ratings — free-text only. Multiple authors supported (Alex and/or
-- Priya). No SMS: in-app formation loop, not an alert.
set search_path to r20reach, public;

create table if not exists reflection_response (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references org(id) on delete cascade,
  reflection_id uuid not null references reflection(id) on delete cascade,
  author_id     uuid not null references membership(id),   -- the pastor who replied
  body          text not null,
  created_at    timestamptz not null default now()
);
create index if not exists reflection_response_reflection_idx on reflection_response (reflection_id);
