-- R20 Reach — Core schema (v0 scaffold)
-- Discipleship Pipeline OS: a follow-up/CRM core designed to grow into a
-- whole-church platform by INTEGRATING Planning Center (system of record) rather
-- than rebuilding it. Rock-RMS-informed patterns: "everything is a group",
-- person_alias for safe merges, pipeline-as-history (not a mutable stage column),
-- attendance = occurrence + attendance, multiplication lineage on groups, EAV for
-- user-defined custom fields only. org_id on every table from day one.
--
-- Conventions: UUID PKs, timestamptz UTC, soft-delete via archived_at where useful.
-- RLS policies live in a SEPARATE migration (0002_rls.sql) — see PLATFORM.md.
-- `pco_*` columns are nullable now; they enable Planning Center sync later.
--
-- SCHEMA: everything lives in `r20reach` so this can share a Supabase project with
-- other apps (e.g. theology-kb/bjosh) without collision. After applying, expose the
-- schema in the dashboard: Settings → API → Exposed schemas → add `r20reach`.
-- (gen_random_uuid() is built into Postgres 13+, no extension needed.)

create schema if not exists r20reach;
set search_path to r20reach, public;

-- ===========================================================================
-- ORG / AUTH / PERMISSIONS  (single-org today, multi-tenant-ready)
-- ===========================================================================
create table org (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text unique not null,
  timezone    text not null default 'America/New_York',
  created_at  timestamptz not null default now()
);

-- app roles: 'admin' | 'staff' | 'leader' | 'member'
create table membership (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references org(id) on delete cascade,
  user_id    uuid not null,                 -- references auth.users(id)
  role       text not null default 'leader',
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);
create index on membership (user_id);
create index on membership (org_id);

-- role -> capability map (checked by has_permission() in RLS)
create table role_permission (
  role       text not null,
  permission text not null,
  primary key (role, permission)
);

-- ===========================================================================
-- PEOPLE / HOUSEHOLDS
-- ===========================================================================
create table person (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references org(id) on delete cascade,
  first_name    text,
  last_name     text,
  phone_e164    text,                        -- normalized E.164
  email         text,                        -- lower() at app layer / index if needed
  campus        text,                        -- Columbia | NYU | CCNY | Pace | ...
  timezone      text not null default 'America/New_York',  -- drives quiet hours
  state         text,                        -- for mini-TCPA windows (FL/OK/WA/CT)
  -- consent (see consent_event for the append-only audit trail)
  sms_consent   text not null default 'unknown',   -- unknown | opted_in | opted_out
  email_consent text not null default 'unknown',
  source        text,                        -- web_form | event | qr | tap | manual | import | ad
  owner_id      uuid references membership(id),    -- the leader who "owns" this relationship (Track A)
  track         text not null default 'warm',      -- warm | cold
  custom        jsonb not null default '{}',       -- sparse, rarely-queried extras
  pco_id        text,                        -- Planning Center person id (sync)
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index person_phone_uq on person (org_id, phone_e164) where phone_e164 is not null;
create index on person (org_id);
create index on person (owner_id);
create index on person (org_id, campus);

-- Never destructively merge a person; keep old ids so historical FKs survive.
create table person_alias (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references org(id) on delete cascade,
  person_id   uuid not null references person(id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index on person_alias (person_id);

create table household (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references org(id) on delete cascade,
  name        text,
  created_at  timestamptz not null default now()
);
create table household_membership (
  household_id uuid not null references household(id) on delete cascade,
  person_id    uuid not null references person(id) on delete cascade,
  role         text not null default 'adult',   -- adult | child
  primary key (household_id, person_id)
);

-- ===========================================================================
-- GROUPS  ("everything is a group": Bible Hangouts, teams, classes)
-- Distinct from the FUNNEL (that's a pipeline, below).
-- ===========================================================================
create table group_type (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references org(id) on delete cascade,
  name         text not null,                 -- 'Bible Hangout' | 'Serving Team' | 'Class'
  takes_attendance boolean not null default true,
  created_at   timestamptz not null default now()
);
create table group_type_role (
  id            uuid primary key default gen_random_uuid(),
  group_type_id uuid not null references group_type(id) on delete cascade,
  name          text not null,                -- 'Leader' | 'Apprentice' | 'Member'
  is_leader     boolean not null default false
);
create table "group" (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references org(id) on delete cascade,
  group_type_id     uuid not null references group_type(id),
  name              text not null,
  campus            text,
  parent_group_id   uuid references "group"(id),   -- org hierarchy / rollup
  multiplied_from_id uuid references "group"(id),   -- lineage: planted FROM this group
  is_active         boolean not null default true,
  pco_id            text,
  created_at        timestamptz not null default now()
);
create index on "group" (org_id);
create index on "group" (org_id, group_type_id);

create table group_membership (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references org(id) on delete cascade,
  group_id     uuid not null references "group"(id) on delete cascade,
  person_id    uuid not null references person(id) on delete cascade,
  role_id      uuid references group_type_role(id),
  status       text not null default 'active',  -- active | inactive | pending
  joined_at    timestamptz not null default now(),
  unique (group_id, person_id)
);
create index on group_membership (person_id);
create index on group_membership (org_id, group_id);

-- multiplication event (stub): the reproduction story (who was sent, who seeded it)
create table group_multiplication_event (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references org(id) on delete cascade,
  source_group_id   uuid not null references "group"(id),
  new_group_id      uuid not null references "group"(id),
  sending_leader_id uuid references person(id),
  seed_member_ids   uuid[] not null default '{}',
  planted_on        date,
  notes             text,
  created_at        timestamptz not null default now()
);

-- ===========================================================================
-- PIPELINE  (the 5C FUNNEL: Campus->Crowd->Community->Committed->Core)
-- Modeled as history, never a single mutable person.stage column.
-- ===========================================================================
create table pipeline (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references org(id) on delete cascade,
  name        text not null,                  -- 'Assimilation'
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create table pipeline_stage (
  id          uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references pipeline(id) on delete cascade,
  name        text not null,                  -- Campus | Crowd | Community | Committed | Core
  sort_order  int not null,
  unique (pipeline_id, sort_order)
);
create table pipeline_item (          -- one person's journey through one pipeline
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references org(id) on delete cascade,
  pipeline_id      uuid not null references pipeline(id) on delete cascade,
  person_id        uuid not null references person(id) on delete cascade,
  current_stage_id uuid not null references pipeline_stage(id),
  state            text not null default 'active',  -- active | future | connected | inactive
  assignee_id      uuid references membership(id),
  follow_up_on     date,                      -- for 'future' state
  created_at       timestamptz not null default now(),
  unique (person_id, pipeline_id)
);
create index on pipeline_item (org_id, current_stage_id);
create index on pipeline_item (assignee_id);

create table pipeline_stage_history (         -- append-only; powers cohort/velocity analytics
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references pipeline_item(id) on delete cascade,
  from_stage  uuid references pipeline_stage(id),
  to_stage    uuid not null references pipeline_stage(id),
  changed_by  uuid references membership(id),
  changed_at  timestamptz not null default now()
);
create index on pipeline_stage_history (item_id);

create table pipeline_activity (              -- a logged touch (the "touchpoints log")
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references org(id) on delete cascade,
  item_id     uuid references pipeline_item(id) on delete cascade,
  person_id   uuid not null references person(id) on delete cascade,
  actor_id    uuid references membership(id),
  type        text not null,                  -- text | call | coffee | prayed_with | visited | note | invite
  channel     text,                           -- sms | email | in_person | phone
  note        text,
  occurred_at timestamptz not null default now()
);
create index on pipeline_activity (person_id);
create index on pipeline_activity (org_id, occurred_at);

-- ===========================================================================
-- FOLLOW-UP AUTOMATION  (Journeys / NurturePoints) — Track B engine
-- Automations attach to events and run in Inngest; these tables hold config+state.
-- ===========================================================================
create table journey (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references org(id) on delete cascade,
  name          text not null,
  is_active     boolean not null default true,
  entry_trigger text,                          -- 'stage_enter:<stage_id>' | 'tag_added' | 'manual'
  created_at    timestamptz not null default now()
);
create table journey_step (                    -- a "NurturePoint"
  id                 uuid primary key default gen_random_uuid(),
  journey_id         uuid not null references journey(id) on delete cascade,
  sort_order         int not null,
  channel            text not null,            -- sms | email
  delay_amount       int,
  delay_unit         text,                     -- minutes | hours | days
  send_window        jsonb,                    -- {days:[...], earliest:'09:00', latest:'12:00'}
  respect_quiet_hours boolean not null default true,
  subject            text,                     -- email only
  body               text not null,            -- with [FIRST_NAME|friend] merge tags
  unique (journey_id, sort_order)
);
create table journey_enrollment (              -- a person's live position in a journey
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references org(id) on delete cascade,
  person_id        uuid not null references person(id) on delete cascade,
  journey_id       uuid not null references journey(id) on delete cascade,
  status           text not null default 'active',  -- active | paused | completed | canceled
  current_step_id  uuid references journey_step(id),
  scheduled_for    timestamptz,               -- next computed send instant (observability + sweeper)
  inngest_run_id   text,
  paused_reason    text,                       -- reply | human_engaged | opted_out
  enrolled_at      timestamptz not null default now(),
  unique (person_id, journey_id)
);
create index on journey_enrollment (status, scheduled_for);

-- ===========================================================================
-- COMMUNICATIONS  (outbound + inbound; SMS + email) + inbox + consent audit
-- ===========================================================================
create table conversation (                    -- shared inbox thread, one per person
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references org(id) on delete cascade,
  person_id      uuid not null references person(id) on delete cascade unique,
  status         text not null default 'open', -- open | snoozed | closed
  assigned_to    uuid references membership(id),
  last_message_at timestamptz,
  unread         boolean not null default true
);
create index on conversation (assigned_to, status);

create table communication (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references org(id) on delete cascade,
  person_id        uuid not null references person(id) on delete cascade,
  conversation_id  uuid references conversation(id) on delete cascade,
  direction        text not null,              -- outbound | inbound
  channel          text not null,              -- sms | email
  body             text,
  -- provenance / idempotency (double-send guard)
  enrollment_id    uuid references journey_enrollment(id),
  step_id          uuid references journey_step(id),
  -- provider
  provider_sid     text,                       -- Twilio MessageSid / Resend id
  status           text,                       -- queued|sent|delivered|failed|undelivered|received
  error_code       text,
  created_at       timestamptz not null default now()
);
create unique index communication_send_uq
  on communication (enrollment_id, step_id)
  where direction = 'outbound' and enrollment_id is not null and step_id is not null;
create index on communication (conversation_id, created_at);

create table communication_event (             -- raw Twilio/Resend status callbacks (audit)
  id            uuid primary key default gen_random_uuid(),
  communication_id uuid not null references communication(id) on delete cascade,
  status        text,
  raw           jsonb,
  received_at   timestamptz not null default now()
);

create table consent_event (                   -- append-only TCPA audit trail (retain >= 4 yrs)
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references org(id) on delete cascade,
  person_id    uuid not null references person(id) on delete cascade,
  channel      text not null,                  -- sms | email
  event        text not null,                  -- opt_in | opt_out | help | resubscribe
  source       text,                           -- web_form | twilio_stop | manual | verbal
  consent_text text,                            -- verbatim opt-in language shown
  ip           text,
  user_agent   text,
  raw          jsonb,
  occurred_at  timestamptz not null default now()
);
create index on consent_event (person_id);

-- ===========================================================================
-- ATTENDANCE  (stub: occurrence + attendance — the Rock two-table pattern)
-- ===========================================================================
create table attendance_occurrence (           -- ONE row per meeting instance
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references org(id) on delete cascade,
  group_id     uuid references "group"(id) on delete cascade,
  occurred_on  date not null,
  headcount    int,                            -- allow count-only logging first
  did_not_occur boolean not null default false,
  notes        text,
  created_at   timestamptz not null default now()
);
create index on attendance_occurrence (org_id, group_id, occurred_on);
create table attendance (                       -- ONE row per person per occurrence
  occurrence_id uuid not null references attendance_occurrence(id) on delete cascade,
  person_id     uuid not null references person(id) on delete cascade,
  did_attend    boolean not null default true,
  primary key (occurrence_id, person_id)
);

-- ===========================================================================
-- CROSS-CUTTING: tags, notes, custom attributes (EAV — user-defined fields only)
-- Polymorphic via (entity_type, entity_id); FK integrity traded for reach.
-- ===========================================================================
create table tag (
  id     uuid primary key default gen_random_uuid(),
  org_id uuid not null references org(id) on delete cascade,
  name   text not null,
  color  text,
  unique (org_id, name)
);
create table taggable (
  tag_id      uuid not null references tag(id) on delete cascade,
  entity_type text not null check (entity_type in ('person','group','pipeline_item')),
  entity_id   uuid not null,
  primary key (tag_id, entity_type, entity_id)
);
create table note (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references org(id) on delete cascade,
  entity_type text not null check (entity_type in ('person','group','pipeline_item')),
  entity_id   uuid not null,
  author_id   uuid references membership(id),
  body        text not null,
  created_at  timestamptz not null default now()
);
create index on note (entity_type, entity_id);

create table attribute (                        -- field definition (custom fields)
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references org(id) on delete cascade,
  entity_type text not null,                    -- 'person' | 'group' | ...
  key         text not null,
  label       text not null,
  data_type   text not null default 'text',     -- text | number | date | bool | select
  options     jsonb,                             -- for select
  unique (org_id, entity_type, key)
);
create table attribute_value (
  attribute_id uuid not null references attribute(id) on delete cascade,
  entity_id    uuid not null,
  value        text,
  primary key (attribute_id, entity_id)
);

-- ===========================================================================
-- NOTES FOR NEXT MIGRATIONS
--  0002_rls.sql       — enable RLS + has_role_on_org()/has_permission() helpers,
--                       policies per table, has_group_role() for leader scoping.
--  0003_seed.sql      — seed R20 org, the 5C pipeline+stages, Bible Hangout
--                       group_type + roles, journeys lifted from the VR account.
-- LEAVE-ROOM (build later, they hang off person+person_alias / group+occurrence):
--   fund/contribution/pledge (giving)     -> prefer Planning Center Giving
--   event/registration_instance/registrant (events) -> reuse attendance_occurrence
--   service_plan/schedule/assignment (serving) -> serving teams are already groups
-- ===========================================================================
