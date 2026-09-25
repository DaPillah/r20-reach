-- 0021_serving_role.sql — the Ministry purpose metric ("sending capacity, not
-- seating capacity"). A person may hold a serving role (greeter, worship, setup,
-- apprentice, etc.); null = not serving. The Movement Snapshot derives an aggregate
-- serving ratio among Committed+Core — never a per-person score. Built ahead of
-- when the Ministry wing starts placing people, so the metric is ready to light up.
set search_path to r20reach, public;

alter table person add column if not exists serving_role text;
