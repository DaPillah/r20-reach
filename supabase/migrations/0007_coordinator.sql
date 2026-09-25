-- 0007_candice_coordinator.sql — Dana (main admin) becomes the coordinator
-- backstop instead of Alex (who won't reply fast enough to be the safety net).
-- Supersedes 0006's Alex seed. Password is set separately via set-password.mjs.
set search_path to r20reach, public;

-- Dana — admin + coordinator (the accountable backstop for captured people
-- with no leader-inviter; resolveOwner falls back to her).
insert into membership (id, org_id, user_id, role, full_name, email, is_coordinator) values
  ('22222222-0000-0000-0000-0000000000ca', '11111111-0000-0000-0000-000000000001',
   '33333333-0000-0000-0000-0000000000ca', 'admin', 'Dana', 'dana@example.com', true)
on conflict (id) do update set role = 'admin', is_coordinator = true;

-- Exactly one coordinator: move the flag off everyone else (Alex stays admin).
update membership set is_coordinator = false
  where org_id = '11111111-0000-0000-0000-000000000001'
    and email <> 'dana@example.com';
