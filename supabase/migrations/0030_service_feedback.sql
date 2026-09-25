-- 0030_service_feedback.sql — the post-Nights "how was tonight?" pulse. A public,
-- low-friction sentiment capture from the /hi card (one-tap rating + optional line),
-- so leaders/pastors get an honest read on the gathering itself (distinct from the
-- per-person funnel). NOT a person row: anonymous by default, no discipleship intent.
--
-- Lives in r20reach (internal app data, admin-read), org-scoped like the rest of the
-- app. Rating is a coarse 1–4 pulse; comment/first_name optional; src carries the
-- ?src= QR/poster tag if present.
set search_path to r20reach, public;

create table if not exists service_feedback (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references org(id) on delete cascade,
  rating      smallint check (rating between 1 and 4),  -- 1 rough · 2 okay · 3 good · 4 great
  comment     text,                                     -- optional honest line (what landed / what didn't)
  first_name  text,                                     -- optional; usually left blank
  src         text,                                     -- ?src= attribution (which QR/poster)
  created_at  timestamptz not null default now()
);
create index if not exists service_feedback_org_date_ix on service_feedback (org_id, created_at desc);
