-- 0018_leader_coverage.sql — temporary "coverage": one leader tends another
-- leader's people for a season WITHOUT taking ownership. E.g. Chris covers
-- Bella's people over the summer while she's busy; Bella still OWNS them
-- (attribution, reflections, long-term relationship stay hers). getSnapshot
-- simply widens a covering leader's visible roster to include the covered
-- leader's people. Ends automatically on ends_on (null = open-ended).
set search_path to r20reach, public;

create table if not exists leader_coverage (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references org(id) on delete cascade,
  covering_id uuid not null references membership(id) on delete cascade,  -- tends the people
  covered_id  uuid not null references membership(id) on delete cascade,  -- keeps ownership
  starts_on   date not null default current_date,
  ends_on     date,                          -- null = open-ended; past = inactive
  created_by  uuid references membership(id),
  created_at  timestamptz not null default now(),
  unique (covering_id, covered_id),
  check (covering_id <> covered_id)
);
create index if not exists leader_coverage_covering_idx on leader_coverage (org_id, covering_id);

-- Seed the live case: Chris covers Bella for the summer (through 2026-08-31).
-- Resolved by name so it isn't tied to hardcoded ids; adjust/remove in
-- Settings → Coverage. Idempotent.
insert into leader_coverage (org_id, covering_id, covered_id, ends_on, created_by)
select m1.org_id, m1.id, m2.id, date '2026-08-31', m1.id
from membership m1
join membership m2 on m2.org_id = m1.org_id
where m1.full_name ilike 'Chris%' and m2.full_name ilike 'Bella%'
on conflict (covering_id, covered_id) do nothing;
