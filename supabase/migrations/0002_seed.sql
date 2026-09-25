-- R20 seed: org config (pipeline, stages, group types, Hangouts) + sample people.
-- Sample people/activities are clearly demo data — delete anytime once real people land.
-- Idempotent-ish: fixed UUIDs + ON CONFLICT DO NOTHING, so re-running is safe.

set search_path to r20reach, public;

-- Phase-1 denormalized working fields on person (current stage/placement/last-touch).
-- History still lives in pipeline_stage_history / pipeline_activity (append-only).
alter table person add column if not exists stage text;
alter table person add column if not exists hangout_id uuid;
alter table person add column if not exists last_touch_at timestamptz;
alter table membership add column if not exists full_name text;
alter table membership add column if not exists email text;

-- org
insert into org (id, name, slug, timezone) values
  ('11111111-0000-0000-0000-000000000001', 'R20 Campus Ministry', 'r20', 'America/New_York')
on conflict (id) do nothing;

-- leaders (membership) — user_id are placeholders until real auth is added
insert into membership (id, org_id, user_id, role, full_name) values
  ('22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001', 'admin',  'Maria'),
  ('22222222-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000002', 'leader', 'Chris'),
  ('22222222-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000003', 'leader', 'Priya')
on conflict (id) do nothing;

-- assimilation pipeline + 5C stages
insert into pipeline (id, org_id, name) values
  ('44444444-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'Assimilation')
on conflict (id) do nothing;
insert into pipeline_stage (id, pipeline_id, name, sort_order) values
  ('44444444-0000-0000-0000-000000000010', '44444444-0000-0000-0000-000000000001', 'Campus', 0),
  ('44444444-0000-0000-0000-000000000011', '44444444-0000-0000-0000-000000000001', 'Crowd', 1),
  ('44444444-0000-0000-0000-000000000012', '44444444-0000-0000-0000-000000000001', 'Community', 2),
  ('44444444-0000-0000-0000-000000000013', '44444444-0000-0000-0000-000000000001', 'Committed', 3),
  ('44444444-0000-0000-0000-000000000014', '44444444-0000-0000-0000-000000000001', 'Core', 4)
on conflict (id) do nothing;

-- Bible Hangout group type + roles
insert into group_type (id, org_id, name, takes_attendance) values
  ('55555555-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'Bible Hangout', true)
on conflict (id) do nothing;
insert into group_type_role (id, group_type_id, name, is_leader) values
  ('55555555-0000-0000-0000-000000000010', '55555555-0000-0000-0000-000000000001', 'Leader', true),
  ('55555555-0000-0000-0000-000000000011', '55555555-0000-0000-0000-000000000001', 'Member', false)
on conflict (id) do nothing;

-- Hangouts (groups)
insert into "group" (id, org_id, group_type_id, name, campus, is_active) values
  ('66666666-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', '55555555-0000-0000-0000-000000000001', 'Columbia · Tuesday', 'Columbia', true),
  ('66666666-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', '55555555-0000-0000-0000-000000000001', 'Columbia · Thursday', 'Columbia', true),
  ('66666666-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001', '55555555-0000-0000-0000-000000000001', 'NYU · Wednesday', 'NYU', true)
on conflict (id) do nothing;

-- Sample people (DEMO — delete once real people are added)
insert into person (id, org_id, first_name, last_name, campus, phone_e164, timezone, sms_consent, source, owner_id, track, stage, hangout_id, last_touch_at, created_at) values
  ('77777777-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001','Sam','Okafor','Columbia','+19995550000','America/New_York','opted_in','event','22222222-0000-0000-0000-000000000001','warm','Crowd',     null,                                    now()-interval '6 days',  now()-interval '20 days'),
  ('77777777-0000-0000-0000-000000000002','11111111-0000-0000-0000-000000000001','Grace','Lin','Columbia','+19995550001','America/New_York','opted_in','event','22222222-0000-0000-0000-000000000001','warm','Community', '66666666-0000-0000-0000-000000000001',  now()-interval '2 days',  now()-interval '45 days'),
  ('77777777-0000-0000-0000-000000000003','11111111-0000-0000-0000-000000000001','Noah','Bennett','Columbia','+19995550002','America/New_York','opted_in','event','22222222-0000-0000-0000-000000000001','warm','Crowd',   null,                                    now()-interval '12 days', now()-interval '30 days'),
  ('77777777-0000-0000-0000-000000000004','11111111-0000-0000-0000-000000000001','Amara','Diallo','Columbia','+19995550003','America/New_York','unknown','qr','22222222-0000-0000-0000-000000000001','warm','Campus',      null,                                    null,                     now()-interval '1 days'),
  ('77777777-0000-0000-0000-000000000005','11111111-0000-0000-0000-000000000001','Ethan','Cho','Columbia','+19995550004','America/New_York','opted_in','event','22222222-0000-0000-0000-000000000001','warm','Crowd',      null,                                    now()-interval '9 days',  now()-interval '15 days'),
  ('77777777-0000-0000-0000-000000000006','11111111-0000-0000-0000-000000000001','Maya','Rivera','Columbia','+19995550005','America/New_York','opted_in','event','22222222-0000-0000-0000-000000000001','warm','Committed','66666666-0000-0000-0000-000000000001',  now()-interval '4 days',  now()-interval '80 days'),
  ('77777777-0000-0000-0000-000000000007','11111111-0000-0000-0000-000000000001','Daniel','Kim','Columbia','+19995550006','America/New_York','opted_in','ad','22222222-0000-0000-0000-000000000001','cold','Campus',        null,                                    now()-interval '3 days',  now()-interval '3 days'),
  ('77777777-0000-0000-0000-000000000008','11111111-0000-0000-0000-000000000001','Zoe','Abara','Columbia','+19995550007','America/New_York','opted_in','event','22222222-0000-0000-0000-000000000001','warm','Crowd',       null,                                    now()-interval '7 days',  now()-interval '22 days'),
  ('77777777-0000-0000-0000-000000000009','11111111-0000-0000-0000-000000000001','Leo','Martins','Columbia','+19995550008','America/New_York','opted_in','event','22222222-0000-0000-0000-000000000002','warm','Community','66666666-0000-0000-0000-000000000002',  now()-interval '5 days',  now()-interval '50 days'),
  ('77777777-0000-0000-0000-000000000010','11111111-0000-0000-0000-000000000001','Priya','Nair','NYU','+19995550009','America/New_York','opted_in','event','22222222-0000-0000-0000-000000000003','warm','Crowd',           null,                                    now()-interval '8 days',  now()-interval '18 days'),
  ('77777777-0000-0000-0000-000000000011','11111111-0000-0000-0000-000000000001','Jonah','Weiss','NYU','+19995550010','America/New_York','opted_in','event','22222222-0000-0000-0000-000000000003','warm','Committed','66666666-0000-0000-0000-000000000003',  now()-interval '1 days',  now()-interval '90 days')
on conflict (id) do nothing;

-- Hangout memberships mirror the placements above
insert into group_membership (id, org_id, group_id, person_id, role_id, status) values
  ('88888888-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001','66666666-0000-0000-0000-000000000001','77777777-0000-0000-0000-000000000002','55555555-0000-0000-0000-000000000011','active'),
  ('88888888-0000-0000-0000-000000000002','11111111-0000-0000-0000-000000000001','66666666-0000-0000-0000-000000000001','77777777-0000-0000-0000-000000000006','55555555-0000-0000-0000-000000000011','active'),
  ('88888888-0000-0000-0000-000000000003','11111111-0000-0000-0000-000000000001','66666666-0000-0000-0000-000000000002','77777777-0000-0000-0000-000000000009','55555555-0000-0000-0000-000000000011','active'),
  ('88888888-0000-0000-0000-000000000004','11111111-0000-0000-0000-000000000001','66666666-0000-0000-0000-000000000003','77777777-0000-0000-0000-000000000011','55555555-0000-0000-0000-000000000011','active')
on conflict (id) do nothing;

-- A couple of seed activities so a timeline isn't empty
insert into pipeline_activity (id, org_id, person_id, actor_id, type, channel, note, occurred_at) values
  ('99999999-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001','77777777-0000-0000-0000-000000000002','22222222-0000-0000-0000-000000000001','in_person', 'in_person','Coffee after R20 — great conversation about doubt.', now()-interval '2 days'),
  ('99999999-0000-0000-0000-000000000002','11111111-0000-0000-0000-000000000001','77777777-0000-0000-0000-000000000006','22222222-0000-0000-0000-000000000001','text','sms','Checked in about midterms.', now()-interval '4 days')
on conflict (id) do nothing;
