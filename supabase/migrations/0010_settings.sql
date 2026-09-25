-- 0010_settings.sql — stage-change history + a small key/value app_setting store.
--
-- Stage history: the app uses `person.stage` as the source of truth (the richer
-- pipeline_item/pipeline_stage_history machinery in 0001 is unused — pipeline_item
-- is empty). So we record transitions keyed by PERSON, not pipeline_item.
--
-- app_setting: first use is the active `term` for reflections/growth (was a
-- hardcoded "Fall 2026" in the client). Generic so future org-level settings
-- (coordinator override, etc.) can reuse it.
set search_path to r20reach, public;

create table if not exists person_stage_history (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references org(id) on delete cascade,
  person_id   uuid not null references person(id) on delete cascade,
  from_stage  text,
  to_stage    text not null,
  changed_by  uuid references membership(id),
  changed_at  timestamptz not null default now()
);
create index if not exists person_stage_history_idx
  on person_stage_history (org_id, person_id, changed_at desc);

create table if not exists app_setting (
  org_id     uuid not null references org(id) on delete cascade,
  key        text not null,
  value      text,
  updated_at timestamptz not null default now(),
  primary key (org_id, key)
);

-- Seed the active term to preserve current behavior (was hardcoded "Fall 2026").
insert into app_setting (org_id, key, value)
  select id, 'term', 'Fall 2026' from org
  on conflict (org_id, key) do nothing;
