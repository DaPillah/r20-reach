-- Auth: give leaders an email + password hash. Passwords are set separately via
-- scripts/set-password.mjs (bcrypt) — never store plaintext or commit hashes.
set search_path to r20reach, public;

alter table membership add column if not exists password_hash text;

update membership set email = 'maria@example.com' where id = '22222222-0000-0000-0000-000000000001' and (email is null or email = '');
update membership set email = 'chris@example.com'    where id = '22222222-0000-0000-0000-000000000002' and (email is null or email = '');
update membership set email = 'priya@example.com'   where id = '22222222-0000-0000-0000-000000000003' and (email is null or email = '');

create unique index if not exists membership_email_uq on membership (lower(email)) where email is not null;
