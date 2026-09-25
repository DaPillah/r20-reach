-- Make Alex (PX) the admin. Maria was placeholder seed data — demote to leader.
-- Reassign the demo people to Alex so his queue is populated on first login.
set search_path to r20reach, public;

insert into membership (id, org_id, user_id, role, full_name, email) values
  ('22222222-0000-0000-0000-0000000000e0', '11111111-0000-0000-0000-000000000001',
   '33333333-0000-0000-0000-0000000000e0', 'admin', 'Alex', 'alex@example.com')
on conflict (id) do nothing;

-- hand Maria's demo people to Alex
update person
  set owner_id = '22222222-0000-0000-0000-0000000000e0'
  where org_id = '11111111-0000-0000-0000-000000000001'
    and owner_id = '22222222-0000-0000-0000-000000000001';

-- Maria is a regular leader now, not the admin
update membership set role = 'leader' where id = '22222222-0000-0000-0000-000000000001';
