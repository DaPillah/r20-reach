-- 0006_coordinator.sql — Assimilation coordinator (the accountable backstop for
-- unclaimed captures). Captures with no leader-inviter land unclaimed (owner_id
-- null) and surface in a SHARED "New — unclaimed" inbox visible to every leader;
-- the coordinator is the one person on the hook to make sure they get claimed.
set search_path to r20reach, public;

alter table membership add column if not exists is_coordinator boolean not null default false;

-- Seed: Alex is the coordinator until changed. Falls back to the first admin if
-- that email isn't present, so a fresh env still has exactly one backstop.
update membership set is_coordinator = true
  where org_id = '11111111-0000-0000-0000-000000000001'
    and email = 'alex@example.com';

update membership set is_coordinator = true
  where org_id = '11111111-0000-0000-0000-000000000001'
    and role = 'admin'
    and not exists (
      select 1 from membership m2
      where m2.org_id = '11111111-0000-0000-0000-000000000001' and m2.is_coordinator
    )
    and id = (
      select id from membership
      where org_id = '11111111-0000-0000-0000-000000000001' and role = 'admin'
      order by created_at limit 1
    );
